let viewMode = "calendar" // "calendar" | "circle"
let table;
let records = []
let selectedCell = null
let hoveredIncident = null
let cnv = null

let zooming = false;
let zoomFrom = null;         // {x,y,w,h}
let zoomTo = null;           // {x,y,w,h}
let zoomCell = null;         // {r,c} the target cell for zoom-in
let zoomT = 0;               // 0..1
let zoomDir = "in";          // "in" or "out"
const ZOOM_MS = 420;         // duration
let zoomStartMs = 0;

let hoveredMonth = null; // { yi, mi, year, bucket }
let monthPanel = null;
let monthPanelContent = null;
let monthPanelOpen = false;

let incidentPanel = null;
let incidentPanelContent = null;
let mapDiv = null;

let leafletMap = null;
let leafletMarker = null;

let modeBtn = null
let backBtn = null

const GOLDEN_ANGLE = 2.4

const TIME_RANGE = [
    { key: "1999-2009", label: "1999-2009", startY: 1999, endY: 2009 },
    { key: "2009-2019", label: "2009-2019", startY: 2009, endY: 2019 },
    { key: "2019-now", label: "2019-now", startY: 2019, endY: (new Date()).getFullYear() + 1 }
]

const SCHOOL_ROWS = [
    { key: "elementary", label: "Elementary" },
    { key: "middle", label: "Middle" },
    { key: "high", label: "High school" }
];

const M = { top: 60, right: 16, bottom: 16, left: 96 }
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

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function preload() {
    table = loadTable("school-shootings-data.csv", "csv", "header")
}

function setup() {
    W = min(W, window.innerWidth)
    H = window.innerHeight
    cnv = createCanvas(W, H)

    records = parseTable(table)
    normalizeSizes(records)

    modeBtn = createButton("Circle view")
    modeBtn.position(16, 12)
    modeBtn.addClass("btn")
    modeBtn.addClass("btn-neutral")
    modeBtn.addClass("btn-sm")
    modeBtn.mousePressed(() => {
        viewMode = (viewMode === "calendar") ? "circle" : "calendar"
        modeBtn.html(viewMode === "calendar" ? "Circle view" : "Calendar view")

        if (viewMode !== "calendar") {
            monthPanel.hide()
            monthPanelOpen = false
        }
        redraw()
    })

    backBtn = createButton("Back");
    backBtn.position(W - 72 - 16, 12);
    backBtn.addClass("btn");
    backBtn.addClass("btn-neutral");
    backBtn.addClass("btn-sm");
    backBtn.mousePressed(() => {
        if (zooming) return;
        if (selectedCell) startZoomOut();   // animate back to overview
    });
    backBtn.hide();

    monthPanel = createDiv();
    monthPanel.addClass("monthPanel")
    monthPanel.hide();

    const closeBtn = createButton("Close");
    closeBtn.parent(monthPanel);
    closeBtn.addClass("btn")
    closeBtn.addClass("btn-error")
    closeBtn.addClass("btn-sm")
    closeBtn.style("margin-bottom", "10px");
    closeBtn.mousePressed(() => {
        monthPanel.hide();
        monthPanelOpen = false;
        redraw();
    });

    monthPanelContent = createDiv("");
    monthPanelContent.parent(monthPanel);

    incidentPanel = createDiv();
    incidentPanel.addClass("incidentPanel");
    incidentPanel.hide();

    const closeIncidentBtn = createButton("Close");
    closeIncidentBtn.parent(incidentPanel);
    closeIncidentBtn.addClass("btn");
    closeIncidentBtn.addClass("btn-error");
    closeIncidentBtn.addClass("btn-sm");
    closeIncidentBtn.style("margin-bottom", "10px");
    closeIncidentBtn.mousePressed(() => incidentPanel.hide());

    incidentPanelContent = createDiv("");
    incidentPanelContent.parent(incidentPanel);

    // map container
    mapDiv = createDiv("");
    mapDiv.parent(incidentPanel);
    mapDiv.id("incidentMap");
    mapDiv.style("width", "100%");
    mapDiv.style("height", "220px");
    mapDiv.style("border", "1px solid #ddd");
    mapDiv.style("border-radius", "10px");
    mapDiv.style("margin-top", "10px");

    redraw()
}

function windowResized() {
    W = min(1000, windowWidth - 40);
    resizeCanvas(W, H);
    redraw();
    if (modeBtn) modeBtn.position(16, 12);
    if (backBtn) backBtn.position(W - 72 - 16, 12);
}

const parseTable = (table) => {
    const out = []
    const cols = table.columns

    for (let r = 0; r < table.getRowCount(); r++) {
        const row = table.getRow(r)
        const d = parseRow(row, cols)

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

const parseRow = (row, cols) => {
    const raw = {}
    for (const k of cols) {
        raw[k] = row.get(k)
    }

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
        sev,
        raw
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

    if (backBtn) {
        if (selectedCell && !zooming) backBtn.show();
        else backBtn.hide();
    }

    if (zooming) {
        drawZoomFrame();
        return;
    }

    if (selectedCell) {
        drawDetail(selectedCell.r, selectedCell.c);
    } else {
        drawOverview();
        noLoop();
    }
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

const drawCellContent = (arr, timeRange, x0, y0, cellW, cellH, isDetail = false) => {
    if (viewMode === "calendar") {
        drawCellContentCalendar(arr, timeRange, x0, y0, cellW, cellH, isDetail);
    } else {
        drawCellContentCircle(arr, timeRange, x0, y0, cellW, cellH, isDetail);
    }
};

const drawCellContentCalendar = (arr, timeRange, x0, y0, cellW, cellH, isDetail = false) => {
    const yCount = yearsInRange(timeRange);
    if (yCount <= 0) {
        return;
    }

    const leftLabelW = isDetail ? 52 : 0
    const topLabelH = isDetail ? 22 : 0

    const innerW = cellW - 2 * SLOT_PAD - leftLabelW;
    const innerH = cellH - 2 * SLOT_PAD - topLabelH;

    // month block size chosen to fit both width and height
    const blockW = innerW / MONTH_COLS;
    const blockH = innerH / 10;

    const gx = x0 + SLOT_PAD + leftLabelW;
    const gy = y0 + SLOT_PAD + topLabelH;

    const { buckets, maxSevSum } = pickIncident(arr, timeRange)

    if (isDetail) {
        noStroke();
        fill(LABEL);

        // Month labels above columns
        textSize(11);
        textAlign(CENTER, CENTER);
        for (let mi = 0; mi < 12; mi++) {
            const cx = gx + mi * blockW + blockW / 2;
            text(MONTH_LABELS[mi], cx, gy - topLabelH / 2);
        }

        // Year labels: start, middle, end
        const yStart = timeRange.startY;
        const yEndInclusive = timeRange.endY - 1; // endY is exclusive

        const yearMarks = [];

        for (let i = yStart; i <= yEndInclusive; i++) {
            yearMarks.push({ y: i, yi: i - yStart })
        }

        textAlign(RIGHT, CENTER);
        textSize(12);
        for (const mark of yearMarks) {
            const cy = gy + mark.yi * blockH + blockH / 2;
            text(String(mark.y), gx - 8, cy);
        }
    }

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
            const seed = hashToInt(`${b.sample.year}-${b.sample.school_name}|${mi}|${yi}`);
            randomSeed(seed);
            const rot = random(TWO_PI);

            // Scale splatter to fit block (don’t exceed block)
            const maxR = 0.45 * min(blockW, blockH);
            const minR = isDetail ? max(5, maxR * 0.12) : 3
            let frac = b.sevSum / maxSevSum
            frac = constrain(frac, 0, 1)
            const t = sqrt(frac)
            const rDraw = lerp(minR, maxR, t)

            push();
            translate(cx, cy);
            rotate(rot);
            drawSplatter(rDraw);
            pop();
        }
    }

    if (isDetail) {
        hoveredMonth = null
    }

    if (isDetail && !zooming) {
        const inside =
            mouseX >= gx && mouseX < gx + innerW &&
            mouseY >= gy && mouseY < gy + innerH;

        if (inside) {
            const mi = floor((mouseX - gx) / blockW);
            const yi = floor((mouseY - gy) / blockH);

            if (yi >= 0 && yi < yCount && mi >= 0 && mi < 12) {
                const b = buckets[yi][mi];
                if (b) {
                    const year = timeRange.startY + yi;
                    hoveredMonth = { yi, mi, year, bucket: b };

                    if (!monthPanelOpen) {
                        const title = `${MONTH_LABELS[mi]} ${year}`;
                        const line2 = `Total casualties: ${b.casualtiesSum}`;
                        const line3 = `Incidents: ${b.count}`;

                        const pad = 8;
                        textSize(12);
                        const w = max(textWidth(title), textWidth(line2), textWidth(line3)) + pad * 2;
                        const h = 50;

                        let tx = mouseX + 12;
                        let ty = mouseY + 12;
                        if (tx + w > W - 8) tx = mouseX - w - 12;
                        if (ty + h > H - 8) ty = mouseY - h - 12;

                        push();
                        noStroke();
                        fill(255, 245);
                        rect(tx, ty, w, h, 8);

                        fill(34);
                        textAlign(LEFT, TOP);
                        text(title, tx + pad, ty + 6);
                        text(line2, tx + pad, ty + 22);
                        text(line3, tx + pad, ty + 36);
                        pop();
                    }
                }
            }
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
    drawCellContent(arr, TIME_RANGE[c], x0, y0 + headerH, cellW, cellH - headerH, true);
}

const drawLabels = (cellW, cellH) => {
    noStroke()
    fill(LABEL)
    textSize(12)

    for (let c = 0; c < TIME_RANGE.length; c++) {
        const x = M.left + c * cellW + cellW / 2
        textAlign(CENTER, CENTER)
        text(TIME_RANGE[c].label, x, 32)
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

    let maxSevSum = 1

    for (const d of incidents) {
        const y = d.dt.getFullYear()
        const m = d.dt.getMonth()

        if (y < timeRange.startY || y >= timeRange.endY) {
            continue
        }

        const yi = y - timeRange.startY
        if (!buckets[yi][m]) {
            buckets[yi][m] = {
                sevSum: 0,
                casualtiesSum: 0,
                count: 0,
                sample: d,
                incidents: []
            };
        }

        buckets[yi][m].sevSum += d.sev;
        buckets[yi][m].casualtiesSum += (d.casualties || 0)
        buckets[yi][m].count += 1;
        buckets[yi][m].incidents.push(d)

        if (d.ts < buckets[yi][m].sample.ts) {
            buckets[yi][m].sample = d
        }

        if (buckets[yi][m].sevSum > maxSevSum) {
            maxSevSum = buckets[yi][m].sevSum
        }
    }

    return { buckets, maxSevSum }
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

function mousePressed(e) {
    if (e && cnv && e.target !== cnv.elt) {
        return
    }

    if (zooming) {
        return
    }

    // Detail mode: click a hovered month to open list
    if (selectedCell) {
        if (viewMode === "calendar") {
            if (hoveredMonth && hoveredMonth.bucket) {
                openMonthPanel(hoveredMonth.mi, hoveredMonth.year, hoveredMonth.bucket);
                monthPanelOpen = true;
                monthPanel.show();
            } else {
                monthPanelOpen = false
                monthPanel.hide()
            }
        } else {
            if (hoveredIncident && hoveredIncident.d) {
                openIncident(hoveredIncident.d);
            }
        }
        return; // don't zoom out on background click; use Back / wheel up / ESC
    }

    // Overview: click cell to zoom in
    const cols = TIME_RANGE.length;
    const rows = SCHOOL_ROWS.length;
    const cellW = (W - M.left - M.right) / cols;
    const cellH = (H - M.top - M.bottom) / rows;

    const hit = cellAt(mouseX, mouseY, cellW, cellH);
    if (hit) startZoomIn(hit);
}

function keyPressed() {
    if (keyCode === ESCAPE && selectedCell) {
        startZoomOut()
        redraw();
    }
}

function mouseWheel(event) {
    if (zooming) {
        return false
    }

    if (!selectedCell && event.deltaY < 25) {
        const cols = TIME_RANGE.length;
        const rows = SCHOOL_ROWS.length;
        const cellW = (W - M.left - M.right) / cols;
        const cellH = (H - M.top - M.bottom) / rows;

        const hit = cellAt(mouseX, mouseY, cellW, cellH);

        if (hit) {
            startZoomIn(hit)
            return false
        }
    }

    if (selectedCell && event.deltaY > 25) {
        startZoomOut()
        return false;
    }

    return true
}

const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}

function getOverviewCellRect(r, c) {
    const cols = TIME_RANGE.length;
    const rows = SCHOOL_ROWS.length;
    const cellW = (W - M.left - M.right) / cols;
    const cellH = (H - M.top - M.bottom) / rows;

    return {
        x: M.left + c * cellW,
        y: M.top + r * cellH,
        w: cellW,
        h: cellH
    };
}

function getDetailRect() {
    const pad = 24;
    return { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
}

function lerpRect(a, b, t) {
    return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        w: lerp(a.w, b.w, t),
        h: lerp(a.h, b.h, t)
    };
}

function startZoomIn(cell) {
    if (zooming) return;

    zooming = true;
    zoomDir = "in";
    zoomCell = cell;
    selectedCell = null;        // not in detail yet

    modeBtn.hide()

    zoomFrom = getOverviewCellRect(cell.r, cell.c);
    zoomTo = getDetailRect();

    zoomT = 0;
    zoomStartMs = millis();
    loop();
}

function startZoomOut() {
    if (zooming) return;
    if (!selectedCell) return;

    if (monthPanelOpen) {
        monthPanel.hide();
        monthPanelOpen = false;
    }

    zooming = true;
    zoomDir = "out";
    zoomCell = selectedCell;

    modeBtn.show()

    zoomFrom = getDetailRect();
    zoomTo = getOverviewCellRect(selectedCell.r, selectedCell.c);

    zoomT = 0;
    zoomStartMs = millis();
    loop();
}

function drawZoomFrame() {
    // optional: draw the overview faintly as context during zoom
    push();
    tint(255, 130); // if you had images; otherwise just draw normally
    pop();

    // Draw overview grid behind (so you see what you're zooming from/to)
    // If this is too slow, you can replace with a simple background rect.
    drawOverview();

    // Interpolate rect
    const elapsed = millis() - zoomStartMs;
    const raw = constrain(elapsed / ZOOM_MS, 0, 1);
    const e = easeInOutCubic(raw);

    const rectNow = lerpRect(zoomFrom, zoomTo, e);

    // Draw a slightly stronger border around the zooming cell
    fill(BG);
    stroke(CELL_STROKE);
    strokeWeight(1);
    rect(rectNow.x, rectNow.y, rectNow.w, rectNow.h);

    // Header + content
    const r = zoomCell.r;
    const c = zoomCell.c;

    // Title fades in as you zoom (nice touch)
    noStroke();
    fill(LABEL);
    textSize(lerp(12, 18, e));
    textAlign(LEFT, TOP);
    const title = `${SCHOOL_ROWS[r].label} — ${TIME_RANGE[c].label}`;
    if (zoomDir === "in") {
        text(title, rectNow.x + 12, rectNow.y + 10);
    }

    // Filter and render content in this interpolated rect
    const levelKey = SCHOOL_ROWS[r].key;
    const rangeKey = TIME_RANGE[c].key;
    const arr = records.filter(d => d.level === levelKey && d.timeRange === rangeKey);

    const headerH = lerp(16, 38, e);
    if (zoomDir === "in") {
        drawCellContent(arr, TIME_RANGE[c], rectNow.x, rectNow.y + headerH, rectNow.w, rectNow.h - headerH, true);
    } else {
        drawCellContent(arr, TIME_RANGE[c], rectNow.x, rectNow.y, rectNow.w, rectNow.h, false)
    }


    if (raw >= 1) {
        zooming = false;

        if (zoomDir === "in") {
            selectedCell = zoomCell;
            loop()
        } else {
            selectedCell = null;
            noLoop();
        }

        redraw();
    }
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function openMonthPanel(mi, year, b) {
    // sort incidents by time
    const items = b.incidents.slice().sort((a, c) => a.ts - c.ts);

    let html = `
    <div class="font-semibold my-2">
      ${MONTH_LABELS[mi]} ${year}
    </div>
    <div class="text-sm">
      Total casualties (month): <strong>${b.casualtiesSum}</strong>
      &nbsp;•&nbsp; Incidents: <strong>${b.count}</strong>
    </div>
    <div class="divider my-0"></div>
  `;

    for (let i = 0; i < items.length; i++) {
        const d = items[i]
        const dateStr = d.dt?.toISOString?.().slice(0, 10) || "";
        html += `
    <div class="incidentItem" data-idx="${i}"
         style="padding:8px 0; border-bottom:1px solid #eee; cursor:pointer;">
      <div style="font-size:12px; font-weight:600;">${esc(d.school_name)}</div>
      <div style="font-size:12px; opacity:0.85;">
        ${dateStr}
        &nbsp;•&nbsp; Killed: <strong>${d.killed}</strong>
        &nbsp;•&nbsp; Injured: <strong>${d.injured}</strong>
        &nbsp;•&nbsp; Casualties: <strong>${d.casualties}</strong>
      </div>
    </div>
  `;
    }

    monthPanelContent.html(html);
    monthPanel.show();
    monthPanelOpen = true;

    const nodes = monthPanelContent.elt.querySelectorAll(".incidentItem");
    nodes.forEach(node => {
        node.addEventListener("click", () => {
            const idx = parseInt(node.getAttribute("data-idx"), 10);
            if (Number.isFinite(idx)) {
                openIncident(items[idx]);
            }
        });
    });
}

function isMeaningful(v) {
    if (v === null || v === undefined) return false;
    const s = String(v).trim();
    if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "nan" || s.toLowerCase() === "na" || s.toLowerCase() === "n/a") return false;
    return true;
}

function prettifyKey(k) {
    return String(k)
        .replace(/_/g, " ")
        .replace(/\b\w/g, ch => ch.toUpperCase());
}

function getLatLng(d) {
    const r = d.raw || {};
    const lat = parseFloat(r.lat ?? r.latitude);
    const lng = parseFloat(r.long ?? r.lng ?? r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

function openIncident(d) {
    // Extract lat/lng (adjust keys if your CSV uses different headers)
    const r = d.raw || {};
    const lat = parseFloat(r.lat ?? r.latitude);
    const lng = parseFloat(r.long ?? r.lng ?? r.longitude);

    const hasMap = Number.isFinite(lat) && Number.isFinite(lng);

    // Build a list of non-null fields to render
    const entries = [];
    for (const k of Object.keys(r)) {
        const v = r[k];
        if (!isMeaningful(v)) continue;
        entries.push([prettifyKey(k), String(v)]);
    }

    const payload = {
        uid: d.uid,
        school_name: d.school_name,
        date: d.dt?.toISOString?.().slice(0, 10) || "",
        killed: d.killed,
        injured: d.injured,
        casualties: d.casualties,
        lat, lng, hasMap,
        entries
    };

    // Pop-up must be triggered by a user click to avoid blockers
    const w = window.open("", "_blank");
    if (!w) return;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Incident Details</title>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  <style>
    body{ font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; margin:0; background:#f6f6f6; color:#111; }
    .wrap{ max-width:1100px; margin:0 auto; padding:18px; }
    .card{ background:#fff; border:1px solid #ddd; border-radius:12px; padding:14px; box-shadow:0 8px 22px rgba(0,0,0,0.06); }
    h1{ font-size:18px; margin:0 0 6px; }
    .meta{ font-size:12px; opacity:.85; margin-bottom:10px; line-height:1.5; }
    #map{ height:260px; border-radius:12px; border:1px solid #ddd; margin-top:12px; }
    table{ width:100%; border-collapse:collapse; margin-top:12px; font-size:12px; }
    td{ padding:8px 10px; border-top:1px solid #eee; vertical-align:top; }
    td.k{ width:34%; opacity:.75; }
    .pill{ display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid #ddd; font-size:12px; margin-right:8px; background:#fafafa; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1 id="title"></h1>
      <div class="meta" id="meta"></div>
      <div id="map" style="display:none;"></div>

      <table id="kv"></table>
    </div>
  </div>

  <script>
    const incident = ${JSON.stringify(payload)};

    document.getElementById("title").textContent = incident.school_name || "Incident";
    document.getElementById("meta").innerHTML =
      '<span class="pill">Date: <b>' + (incident.date || '-') + '</b></span>' +
      '<span class="pill">Killed: <b>' + (incident.killed ?? 0) + '</b></span>' +
      '<span class="pill">Injured: <b>' + (incident.injured ?? 0) + '</b></span>' +
      '<span class="pill">Casualties: <b>' + (incident.casualties ?? 0) + '</b></span>';

    // Render key/value table (non-null only)
    const kv = document.getElementById("kv");
    for (const [k, v] of incident.entries) {
      const tr = document.createElement("tr");
      const tdK = document.createElement("td");
      tdK.className = "k";
      tdK.textContent = k;

      const tdV = document.createElement("td");
      tdV.textContent = v;

      tr.appendChild(tdK);
      tr.appendChild(tdV);
      kv.appendChild(tr);
    }

    // Map if we have coordinates
    if (incident.hasMap) {
      const mapDiv = document.getElementById("map");
      mapDiv.style.display = "block";

      const map = L.map(mapDiv).setView([incident.lat, incident.lng], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      L.marker([incident.lat, incident.lng]).addTo(map);

      // In case the tab renders before layout is final
      setTimeout(() => map.invalidateSize(), 0);
    }
  </script>
</body>
</html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
}

const drawCellContentCircle = (arr, timeRange, x0, y0, cellW, cellH, isDetail = false) => {
    const pad = isDetail ? 28 : 14;
    const gx = x0 + pad;
    const gy = y0 + pad;
    const innerW = cellW - 2 * pad;
    const innerH = cellH - 2 * pad;

    const cx0 = gx + innerW / 2;
    const cy0 = gy + innerH / 2;
    const R = min(innerW, innerH) * 0.5;

    // Sort: most severe first -> closer to center
    const items = arr.slice().sort((a, b) => (b.sev - a.sev) || (a.ts - b.ts));
    const n = items.length;

    hoveredIncident = null;

    for (let i = 0; i < n; i++) {
        const d = items[i];

        // Radius grows with rank (i): severe first => small radius => center
        const frac = (n <= 1) ? 0 : i / (n - 1);
        const rr = sqrt(frac) * (R * 0.92);

        // Deterministic but well-spaced angles (golden angle spiral)
        const seed = hashToInt(`${d.ts}|${d.school_name}|${d.year}`);
        randomSeed(seed);
        const angle = i * GOLDEN_ANGLE + random(-0.15, 0.15);

        const x = cx0 + cos(angle) * rr;
        const y = cy0 + sin(angle) * rr;

        // Size: use your global radius but allow a bigger cap in detail
        const maxMark = min(R * 0.12, isDetail ? 30 : 18);
        const rDraw = constrain(d.radius * 2 * (isDetail ? 1.5 : 1.0), 2.5, maxMark);

        // Stable rotation + stable splatter shape
        const rot = random(TWO_PI);
        randomSeed(seed + 999);

        push();
        translate(x, y);
        rotate(rot);
        drawSplatter(rDraw);
        pop();

        // Hover hit test (detail view)
        if (isDetail) {
            const dist2 = (mouseX - x) * (mouseX - x) + (mouseY - y) * (mouseY - y);
            if (dist2 <= rDraw * rDraw) {
                // keep the “closest”/largest hit if multiple overlap
                if (!hoveredIncident || rDraw > hoveredIncident.r) {
                    hoveredIncident = { d, x, y, r: rDraw };
                }
            }
        }
    }

    if (isDetail && hoveredIncident) {
        drawIncidentTooltip(hoveredIncident.d, mouseX, mouseY);
    }
}

function drawIncidentTooltip(d, mx, my) {
    const dateStr = d.dt?.toISOString?.().slice(0, 10) || "";
    const title = `${dateStr}`;
    const line1 = d.school_name || "";
    const line2 = `Killed: ${d.killed} • Injured: ${d.injured} • Casualties: ${d.casualties}`;

    const pad = 8;
    textSize(12);
    const w = max(textWidth(title), textWidth(line1), textWidth(line2)) + pad * 2;
    const h = 58;

    let tx = mx + 12;
    let ty = my + 12;
    if (tx + w > W - 8) tx = mx - w - 12;
    if (ty + h > H - 8) ty = my - h - 12;

    push();
    noStroke();
    fill(255, 245);
    rect(tx, ty, w, h, 8);

    fill(34);
    textAlign(LEFT, TOP);
    text(title, tx + pad, ty + 6);
    text(line1, tx + pad, ty + 22);
    text(line2, tx + pad, ty + 38);
    pop();
}