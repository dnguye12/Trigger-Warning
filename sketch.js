let table;
let records = []
let selectedCell = null

const TIME_RANGE = [
    { key: "1999-2009", label: "1999-2009", startY: 1999, endY: 2009 },
    { key: "2009-2019", label: "2009-2019", startY: 2010, endY: 2019 },
    { key: "2019-now", label: "2019-now", startY: 2020, endY: (new Date()).getFullYear() + 1 }
]

const SCHOOL_ROWS = [
    { key: "elementary", label: "Elementary" },
    { key: "middle", label: "Middle" },
    { key: "high", label: "High school" }
];

const M = { top: 40, right: 16, bottom: 16, left: 96 }
let W = window.innerWidth
let H = window.innerHeight

const SLOT_PX = 32;
const SLOT_PAD = 16;
const MAX_STACK_PER_SLOT = 1;

const BG = "#f2f2f2"
const CELL_STROKE = "#222"
const LABEL = "#222"

const MAX_MARKS_PER_CELL = 250
const SIZE_RANGE = [3, 26]

const MONTH_COLS = 12;
const MONTH_PAD_X = 10;
const MONTH_PAD_Y = 12;

const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function preload() {
    table = loadTable("school-shootings-data.csv", "csv", "header")
}

let quitBtn = null

function setup() {
    W = min(W, window.innerWidth)
    H = window.innerHeight
    const cellH = 150
    //H = M.top + M.bottom + SCHOOL_ROWS.length * cellH
    createCanvas(W, H)

    quitBtn = createButton("Back")
    quitBtn.position(W - 72 - 16, 12)
    quitBtn.size(72, 28)
    quitBtn.addClass("quitBtn")
    quitBtn.mousePressed(() => {
        selectedCell = null
        redraw()
    })
    quitBtn.hide()

    records = parseTable(table)
    normalizeSizes(records)

    redraw()
}

function windowResized() {
    W = min(1000, windowWidth - 40);
    resizeCanvas(W, H);
    redraw();
}

const parseTable = (table) => {
    const out = []

    for (let r = 0; r < table.getRowCount(); r++) {
        const row = table.getRow(r)
        const d = parseRow(row)

        if (!d) {
            continue
        }

        d.timeRange = inferTimeRange(d.year)
        d.level = inferSchoolLevel(d)

        if (d.timeRange && d.level && d.level !== "other") {
            out.push(d)
        }
    }

    return out
}

const parseRow = (row) => {
    const year = int(row.get("year"))
    if (!Number.isFinite(year)) {
        return null
    }

    const dateHelper = row.get("date")
    let dt = new Date(dateHelper)
    let ts
    if (!isNaN(dt.getTime())) {
        ts = dt.getTime()
    } else {
        dt = new Date(year, 0, 1)
        ts = dt.getTime()
    }

    const injured = toNum(row.get("injured"));
    const killed = toNum(row.get("killed"));
    const casualties = toNum(row.get("casualties"));

    const school_name = row.get("school_name")

    const sev = injured + 5 * killed

    return {
        dt,
        ts,
        year,
        school_name,
        injured,
        killed,
        casualties,
        sev
    }

}

const toNum = (x) => {
    const n = float(x)
    return Number.isFinite(n) ? n : 0
}

const inferTimeRange = (year) => {
    for (const t of TIME_RANGE) {
        if (year >= t.startY && year < t.endY) {
            return t.key
        }
    }
    return null
}

const inferSchoolLevel = (d) => {
    const name = d.school_name.toLowerCase().replace(/[^\w\s-]/g, " ")
    const n = " " + name.replace(/\s+/g, " ").trim() + " "
    const has = (re) => re.test(n)

    if (
        has(/\bjunior\s*-\s*senior\s+high\b/) ||
        has(/\bjr\s*-\s*sr\s+high\b/) ||
        has(/\bsenior\s+high\b/) ||
        has(/\bhigh\b/) ||
        has(/\bhs\b/) ||
        has(/\bh\s*s\b/)
    ) {
        return "high";
    }

    if (
        has(/\bmiddle\b/) ||
        has(/\bmid\b/) ||
        has(/\bms\b/) ||
        has(/\bm\s*s\b/) ||
        has(/\bjunior\s+high\b/) ||
        has(/\bjr\s+high\b/) ||
        has(/\bintermediate\b/) ||
        has(/\bsecondary\b/)
    ) {
        return "middle";
    }

    if (
        has(/\belementary\b/) ||
        has(/\bprimary\b/) ||
        has(/\bgrade\s+school\b/) ||
        has(/\bgrammar\s+school\b/)
    ) {
        return "elementary";
    }

    return "other"
}

const normalizeSizes = (arr) => {
    let maxSev = 1
    for (const d of arr) {
        maxSev = max(maxSev, d.sev)
    }

    for (const d of arr) {
        const t = Math.sqrt(d.sev / maxSev)
        d.radius = lerp(SIZE_RANGE[0], SIZE_RANGE[1], constrain(t, 0, 1))
    }
}

function draw() {
    background(BG);

    if (selectedCell) {
        quitBtn.show()
        drawDetail(selectedCell.r, selectedCell.c)
    } else {
        quitBtn.hide()
        drawOverview()
    }

    /*
        const cols = TIME_RANGE.length
        const rows = SCHOOL_ROWS.length
        const cellW = (W - M.left - M.right) / cols
        const cellH = (H - M.top - M.bottom) / rows
    
        drawLabels(cellW, cellH)
        drawGrid(cellW, cellH)
    
        const byCell = new Map()
    
        for (const d of records) {
            const r = SCHOOL_ROWS.findIndex(x => x.key === d.level)
            const c = TIME_RANGE.findIndex(x => x.key === d.timeRange)
    
            if (r < 0 || c < 0) {
                continue
            }
    
            const k = `${r},${c}`
            if (!byCell.has(k)) {
                byCell.set(k, [])
            }
            byCell.get(k).push(d)
        }
    
        for (const [k, arr] of byCell.entries()) {
            const [r, c] = k.split(",").map(n => int(n));
            const x0 = M.left + c * cellW;
            const y0 = M.top + r * cellH;
    
            const rangeKey = TIME_RANGE[c].key
            const timeRange = getRangeByKey(rangeKey)
    
            if (!timeRange) {
                continue
            }
    
            const yCount = yearsInRange(timeRange);
            if (yCount <= 0) continue;
    
            const innerW = cellW - 2 * SLOT_PAD;
            const innerH = cellH - 2 * SLOT_PAD;
    
            // month block size chosen to fit both width and height
            const blockW = innerW / MONTH_COLS;
            const blockH = innerH / 10;
    
            const gx = x0 + SLOT_PAD;
            const gy = y0 + SLOT_PAD;
    
            // winners[yearIndex][monthIndex] = record or null
            const buckets = pickIncident(arr, timeRange)
    
            // Optional: draw the mini-grid lines (light)
            stroke(0, 0, 0, 30);
            strokeWeight(1);
            noFill();
            rect(gx, gy, innerW, innerH);
            for (let c2 = 1; c2 < MONTH_COLS; c2++) {
                line(gx + c2 * blockW, gy, gx + c2 * blockW, gy + innerH);
            }
            for (let r2 = 1; r2 < 10; r2++) {
                line(gx, gy + r2 * blockH, gx + innerW, gy + r2 * blockH);
            }
    
            // Draw splatters at block centers
            for (let yi = 0; yi < yCount; yi++) {
                for (let mi = 0; mi < 12; mi++) {
                    const b = buckets[yi][mi];
                    if (!b) continue;
    
                    const cx = gx + mi * blockW + blockW / 2;
                    const cy = gy + yi * blockH + blockH / 2;
    
                    // Deterministic rotation per record
                    const seed = hashToInt(`${b.year}-${b.school_name}|${mi}|${yi}`);
                    randomSeed(seed);
                    const rot = random(TWO_PI);
    
                    // Scale splatter to fit block (don’t exceed block)
                    const maxR = 0.45 * min(blockW, blockH);
                    const t = sqrt(b.sevSum / 10)
                    const rDraw = lerp(3, maxR, constrain(t, 0, 1))
    
                    push();
                    translate(cx, cy);
                    rotate(rot);
                    drawSplatter(rDraw);
                    pop();
                }
            }
        }*/
}

const drawOverview = () => {
    const cols = TIME_RANGE.length;
    const rows = SCHOOL_ROWS.length;
    const cellW = (W - M.left - M.right) / cols;
    const cellH = (H - M.top - M.bottom) / rows;

    drawLabels(cellW, cellH);
    drawGrid(cellW, cellH);

    const byCell = new Map();

    for (const d of records) {
        const r = SCHOOL_ROWS.findIndex(x => x.key === d.level);
        const c = TIME_RANGE.findIndex(x => x.key === d.timeRange);
        if (r < 0 || c < 0) continue;

        const k = `${r},${c}`;
        if (!byCell.has(k)) byCell.set(k, []);
        byCell.get(k).push(d);
    }

    for (const [k, arr] of byCell.entries()) {
        const [r, c] = k.split(",").map(n => int(n));
        const x0 = M.left + c * cellW;
        const y0 = M.top + r * cellH;

        const timeRange = TIME_RANGE[c];
        drawCellContent(arr, timeRange, x0, y0, cellW, cellH);
    }
}

const drawCellContent = (arr, timeRange, x0, y0, cellW, cellH) => {
    const yCount = yearsInRange(timeRange);
    if (yCount <= 0) return;

    const innerW = cellW - 2 * SLOT_PAD;
    const innerH = cellH - 2 * SLOT_PAD;

    // month block size chosen to fit both width and height
    const blockW = innerW / MONTH_COLS;
    const blockH = innerH / 10;

    const gx = x0 + SLOT_PAD;
    const gy = y0 + SLOT_PAD;

    // winners[yearIndex][monthIndex] = record or null
    const buckets = pickIncident(arr, timeRange)

    // Optional: draw the mini-grid lines (light)
    stroke(0, 0, 0, 30);
    strokeWeight(1);
    noFill();
    rect(gx, gy, innerW, innerH);
    for (let c2 = 1; c2 < MONTH_COLS; c2++) {
        line(gx + c2 * blockW, gy, gx + c2 * blockW, gy + innerH);
    }
    for (let r2 = 1; r2 < 10; r2++) {
        line(gx, gy + r2 * blockH, gx + innerW, gy + r2 * blockH);
    }

    // Draw splatters at block centers
    for (let yi = 0; yi < yCount; yi++) {
        for (let mi = 0; mi < 12; mi++) {
            const b = buckets[yi][mi];
            if (!b) continue;

            const cx = gx + mi * blockW + blockW / 2;
            const cy = gy + yi * blockH + blockH / 2;

            // Deterministic rotation per record
            const seed = hashToInt(`${b.year}-${b.school_name}|${mi}|${yi}`);
            randomSeed(seed);
            const rot = random(TWO_PI);

            // Scale splatter to fit block (don’t exceed block)
            const maxR = 0.45 * min(blockW, blockH);
            const t = sqrt(b.sevSum / 10)
            const rDraw = lerp(3, maxR, constrain(t, 0, 1))

            push();
            translate(cx, cy);
            rotate(rot);
            drawSplatter(rDraw);
            pop();
        }
    }


}

const drawDetail = (r, c) => {
    // Make a big “cell” that fills the canvas with some padding
    const pad = 0;

    const x0 = pad;
    const y0 = pad;
    const cellW = W - pad * 2;
    const cellH = H - pad * 2;

    // Background for the focused cell
    fill(BG);
    stroke(CELL_STROKE);
    strokeWeight(2);
    rect(x0, y0, cellW, cellH);

    // Title
    noStroke();
    fill(LABEL);
    textSize(24);
    textAlign(LEFT, TOP);
    const title = `${SCHOOL_ROWS[r].label} — ${TIME_RANGE[c].label}`;
    text(title, x0 + 16, y0 + 16);

    // Filter records for that cell
    const levelKey = SCHOOL_ROWS[r].key;
    const rangeKey = TIME_RANGE[c].key;

    const arr = records.filter(d => d.level === levelKey && d.timeRange === rangeKey);

    // Draw content below title area
    const headerH = 38;
    drawCellContent(arr, TIME_RANGE[c], x0, y0 + headerH, cellW, cellH - headerH);
}

const drawLabels = (cellW, cellH) => {
    noStroke()
    fill(LABEL)
    textSize(12)

    for (let c = 0; c < TIME_RANGE.length; c++) {
        const x = M.left + c * cellW + cellW / 2
        textAlign(CENTER, CENTER)
        text(TIME_RANGE[c].label, x, 24)
    }

    for (let r = 0; r < SCHOOL_ROWS.length; r++) {
        const y = M.top + r * cellH + cellH / 2
        textAlign(RIGHT, CENTER)
        text(SCHOOL_ROWS[r].label, M.left - 12, y)
    }


}

const drawGrid = (cellW, cellH) => {
    for (let r = 0; r < SCHOOL_ROWS.length; r++) {
        for (let c = 0; c < TIME_RANGE.length; c++) {
            const x = M.left + c * cellW
            const y = M.top + r * cellH

            fill(BG)
            stroke(CELL_STROKE)
            strokeWeight(1)
            rect(x, y, cellW, cellH)
        }
    }
}

const drawSplatter = (radius) => {
    fill(220, 38, 38, 90)
    stroke(220, 38, 38, 70)
    strokeWeight(0.8)

    const n = floor(random(18, 28))
    beginShape()
    for (let i = 0; i < n; i++) {
        const a = (i / n) * TWO_PI;
        const wobble = random(0.55, 1.25);
        const rr = radius * wobble;
        const px = cos(a) * rr;
        const py = sin(a) * rr;
        curveVertex(px, py);
    }

    for (let i = 0; i < 3; i++) {
        const a = (i / n) * TWO_PI;
        const wobble = random(0.55, 1.25);
        const rr = radius * wobble;
        curveVertex(cos(a) * rr, sin(a) * rr);
    }
    endShape(CLOSE);

    noStroke();
    fill(220, 38, 38, 60);

    const k = floor(random(3, 9));
    for (let i = 0; i < k; i++) {
        const a = random(TWO_PI);
        const dist = radius * random(1.0, 2.5);
        const rr = max(1.5, radius * random(0.08, 0.18));
        ellipse(cos(a) * dist, sin(a) * dist, rr * 2, rr * 2);
    }
}

const hashToInt = (str) => {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0
}

function rangeStartMs(t) {
    return new Date(t.startY, 0, 1).getTime();
}
function rangeEndMs(t) {
    return new Date(t.endY, 0, 1).getTime();
}

function getRangeByKey(key) {
    return TIME_RANGE.find(t => t.key === key);
}

const yearsInRange = (timeRange) => {
    return timeRange.endY - timeRange.startY
}

const buildSlotGrid = (cellW, cellH) => {
    const innerW = cellW - 2 * SLOT_PAD;
    const innerH = cellH - 2 * SLOT_PAD;

    const cols = max(1, floor(innerW / SLOT_PX));
    const rows = max(1, floor(innerH / SLOT_PX));
    const total = cols * rows;

    return { cols, rows, total };
}

const assignToSlots = (incidents, timeRange, grid) => {
    const start = rangeStartMs(timeRange)
    const end = rangeEndMs(timeRange)
    const span = max(1, end - start)

    const timeRangeMS = span / grid.total
    const slots = Array.from({ length: grid.total }, () => [])

    const sorted = incidents.slice().sort((a, b) => a.ts - b.ts)

    for (const d of sorted) {
        let idx = Math.floor((d.ts - start) / timeRangeMS)
        idx = constrain(idx, 0, grid.total - 1)

        let placed = false

        for (let step = 0; step <= 20; step++) {
            const candidates = step === 0 ? [idx] : [idx + step, idx - step]
            for (const j of candidates) {
                if (j < 0 || j >= grid.total) {
                    continue;
                }
                if (slots[j].length < MAX_STACK_PER_SLOT) {
                    slots[j].push(d);
                    placed = true;
                    break;
                }
            }
            if (placed) {
                break;
            }
        }

        if (!placed) {
            slots[idx].push(d)
        }
    }

    return slots
}

const buildSlots = (timeRange) => {
    const slots = []
    let y = timeRange.startY
    let m = 0
    const endM = 11
    while (y < timeRange.endY || (y === timeRange.endY && m <= endM)) {
        slots.push({
            key: `${y}-${String(m + 1).padStart(2, "0")}`,
            y,
            m
        })
        m++
        if (m > 11) {
            m = 0
            y++
        }
    }
    return slots
}

const slotKeyForRecord = (d) => {
    const y = d.dt.getFullYear()
    const m = d.dt.getMonth() + 1
    return `${y}-${String(m).padStart(2, "0")}`
}

const pickIncident = (incidents, timeRange) => {
    const yCount = yearsInRange(timeRange)
    const buckets = Array.from({ length: yCount }, () => Array.from({ length: 12 }, () => null))

    for (const d of incidents) {
        const y = d.dt.getFullYear()
        const m = d.dt.getMonth()

        if (y < timeRange.startY || y >= timeRange.endY) {
            continue
        }

        const yi = y - timeRange.startY
        if (!buckets[yi][m]) {
            buckets[yi][m] = { sevSum: 0, count: 0, sample: d };
        }

        buckets[yi][m].sevSum += d.sev;
        buckets[yi][m].count += 1;
    }

    return buckets
}

const cellAt = (mx, my, cellW, cellH) => {
    const xMin = M.left
    const xMax = W - M.right
    const yMin = M.top
    const yMax = H - M.bottom

    if (mx < xMin || mx > xMax || my < yMin || my > yMax) {
        return null
    }

    const c = floor((mx - xMin) / cellW);
    const r = floor((my - yMin) / cellH);

    if (c < 0 || c >= TIME_RANGE.length) return null;
    if (r < 0 || r >= SCHOOL_ROWS.length) return null;

    return { r, c }
}

function mousePressed() {
    if (!selectedCell) {
        const cols = TIME_RANGE.length
        const rows = SCHOOL_ROWS.length
        const cellW = (W - M.left - M.right) / cols;
        const cellH = (H - M.top - M.bottom) / rows;

        const hit = cellAt(mouseX, mouseY, cellW, cellH)
        if (hit) {
            selectedCell = hit
            redraw()
        }
    }
}

function keyPressed() {
    if (keyCode === ESCAPE && selectedCell) {
        selectedCell = null;
        redraw();
    }
}