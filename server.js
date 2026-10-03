const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const ptp = require('pdf-to-printer'); 
const sharp = require('sharp');
const http = require('http'); 
const { Server } = require('socket.io'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server); 
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

if (!fs.existsSync(path.join(__dirname, 'uploads'))){
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// ⚠️ रेज़रपे से अप्रूवल मिलने के बाद यहाँ अपनी 'rzp_live_...' चाबी डालना
const RAZORPAY_KEY_ID = "rzp_live_YOUR_LIVE_KEY_ID_HERE"; 

const printers = {
    "PRINTER_01": { name: "Central Library LaserJet", location: "Block A, 1st Floor", pdfPrice: 5, photoPrice: 10 },
    "PRINTER_02": { name: "Tech Lab Color Printer", location: "Lab 3, Ground Floor", pdfPrice: 8, photoPrice: 15 },
    "PRINTER_03": { name: "Canteen Kiosk Printer", location: "Cafeteria Zone", pdfPrice: 5, photoPrice: 10 }
};

// 1. दुकानदार का प्रीमियम लाइव डैशबोर्ड
app.get('/dashboard', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Merchant Monitor Panel</title>
            <script src="/socket.io/socket.io.js"></script>
            <style>
                body { font-family: -apple-system, system-ui, sans-serif; background: #0b0f19; color: #ffffff; padding: 40px; margin: 0; }
                .card { background: #131a2c; max-width: 600px; margin: auto; padding: 35px; border-radius: 16px; box-shadow: 0 10px 30px rgba(124,58,237,0.2); border: 1px solid #1e293b; animation: fIn 0.4s ease; }
                h2 { color: #ffffff; margin: 0 0 5px 0; display: flex; justify-content: space-between; align-items: center; font-size: 24px; }
                .badge { font-size: 11px; background: #a78bfa; color: #0b0f19; padding: 5px 12px; border-radius: 20px; font-weight: 700; text-transform: uppercase; }
                hr { border: 0; border-top: 1px solid #1e293b; margin: 25px 0; }
                .job { background: #ffffff; color: #0f172a; padding: 16px; margin: 12px 0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; border-left: 5px solid #7c3aed; transition: 0.2s; animation: sUp 0.3s cubic-bezier(0.1, 0.8, 0.3, 1); }
                .job:hover { transform: translateY(-2px); }
                .price { color: #7c3aed; font-weight: 700; font-size: 18px; }
                @keyframes fIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes sUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🖨️ Kiosk Print Monitor <span class="badge">● Online</span></h2>
                <p style="color: #94a3b8; font-size: 13px; margin: 0;">Real-time Cloud Node Spooler</p>
                <hr>
                <ul id="print-list" style="list-style-type: none; padding: 0;">
                    <li id="no-jobs" style="color: #64748b; font-style: italic; text-align: center; padding: 40px;">Waiting for verified live user bank payments...</li>
                </ul>
            </div>
            <script>
                const socket = io();
                socket.on('new-print-job', (data) => {
                    const noJobs = document.getElementById('no-jobs'); if(noJobs) noJobs.remove();
                    const list = document.getElementById('print-list'); const item = document.createElement('li');
                    item.className = "job";
                    item.innerHTML = '<div><b style="font-size:14px;">' + data.printerName + '</b><br><span style="color:#64748b; font-size:12px;">Format: ' + data.format + '</span></div><div class="price">₹' + data.cost + '</div>';
                    list.prepend(item);
                    const audio = new AudioContext(); const osc = audio.createOscillator();
                    osc.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.15);
                });
            </script>
        </body>
        </html>
    `);
});
// 2. ग्राहक का प्रीमियम मोबाइल अपलोड पेज
app.get('/print', (req, res) => {
    const printerId = req.query.id || "PRINTER_01"; 
    const activePrinter = printers[printerId] || printers["PRINTER_01"];

    res.send(`
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Smart Pay-Per-Print Hub</title>
            <style>
                body { font-family: -apple-system, system-ui, sans-serif; background: #0b0f19; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; margin: 0; }
                .card { background: #131a2c; max-width: 400px; width: 100%; padding: 35px; border-radius: 20px; box-shadow: 0 15px 35px rgba(124,58,237,0.2); border: 1px solid #1e293b; text-align: center; border-top: 5px solid #7c3aed; animation: fIn 0.5s cubic-bezier(0.1, 0.8, 0.3, 1); }
                h2 { color: #ffffff; margin: 0 0 6px 0; font-size: 22px; font-weight: 700; }
                .loc { font-size: 12px; color: #a78bfa; font-weight: 600; margin-bottom: 20px; display: inline-block; background: rgba(124,58,237,0.1); padding: 4px 14px; border-radius: 20px; }
                .rates { background: #ffffff; padding: 14px; border-radius: 14px; font-size: 13px; display: flex; justify-content: space-around; color: #0f172a; margin: 20px 0; box-shadow: 0 4px 10px rgba(0,0,0,0.03); font-weight: 600; }
                .file-custom { border: 2px dashed #475569; padding: 35px 20px; border-radius: 14px; background: rgba(255,255,255,0.01); cursor: pointer; display: block; margin-bottom: 25px; transition: 0.25s ease; }
                .file-custom:hover { border-color: #a78bfa; background: rgba(124,58,237,0.04); transform: scale(1.01); }
                .btn { width: 100%; background: #ffffff; color: #0b0f19; border: none; padding: 14px; font-size: 14px; font-weight: 700; border-radius: 12px; cursor: pointer; transition: 0.2s; text-transform: uppercase; animation: pulse 2s infinite; }
                .btn:hover { background: #a78bfa; transform: translateY(-1px); animation: none; }
                @keyframes fIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.2); } 70% { box-shadow: 0 0 0 10px rgba(255,255,255,0); } 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Smart Pay-Per-Print Hub 🖨️</h2>
                <div class="loc">📍 ${activePrinter.location}</div>
                <div class="rates">
                    <div>📄 PDF: <span style="color:#7c3aed;"><b>₹${activePrinter.pdfPrice}/pg</b></span></div>
                    <div style="width: 1px; background: #e2e8f0;"></div>
                    <div>🖼️ Photo: <span style="color:#7c3aed;"><b>₹${activePrinter.photoPrice}/img</b></span></div>
                </div>
                <form action="/upload?id=${printerId}" method="POST" enctype="multipart/form-data">
                    <label class="file-custom">
                        <input type="file" name="document" accept="application/pdf, image/*" required style="display:none;" id="f-in"/>
                        <span style="font-size:30px; display:block;">📂</span>
                        <span style="display:block; font-size:13px; font-weight:600; margin-top:10px; color:#94a3b8;" id="f-lbl">Tap to Select Document</span>
                    </label>
                    <button type="submit" class="btn">Process Invoice</button>
                </form>
            </div>
            <script>
                document.getElementById('f-in').addEventListener('change', function(e) {
                    document.getElementById('f-lbl').innerText = e.target.files.name;
                    document.getElementById('f-lbl').style.color = '#a78bfa';
                });
            </script>
        </body>
        </html>
    `);
});

// 3. ग्राहक का इनवॉइस पेमेंट पेज
app.post('/upload', upload.single('document'), async (req, res) => {
    let filePath = "";
    try {
        if (!req.file) return res.status(400).send("No file uploaded.");
        const printerId = req.query.id; const activePrinter = printers[printerId] || printers["PRINTER_01"];
        filePath = path.join(__dirname, 'uploads', req.file.filename);
        let totalPages = 1; let totalCost = 0; let fileType = req.file.mimetype; let displayType = "PDF Document";

        if (fileType === 'application/pdf') {
            const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
            const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
            const pdf = await loadingTask.promise;
            totalPages = pdf.numPages; totalCost = totalPages * activePrinter.pdfPrice;
        } else if (fileType.startsWith('image/')) {
            displayType = "Image/Photo"; totalCost = activePrinter.photoPrice;
            const processedPhotoPath = filePath + '_converted.png';
            await sharp(filePath).resize(2480, 3508, { fit: 'inside' }).toFile(processedPhotoPath);
            fs.unlinkSync(filePath); filePath = processedPhotoPath; req.file.filename = req.file.filename + '_converted.png';
        }
        const amountInPaise = totalCost * 100;
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Secure Checkout</title>
                <script src="https://razorpay.com"></script>
                <style>
                    body { font-family: -apple-system, system-ui, sans-serif; background-color: #0b0f19; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; margin: 0; }
                    .card { background: #131a2c; max-width: 400px; width: 100%; padding: 35px; border-radius: 20px; box-shadow: 0px 15px 35px rgba(124, 58, 237, 0.2); border: 1px solid #1e293b; text-align: center; animation: fIn 0.3s ease; }
                    .invoice { background: #ffffff; border: 1px solid #e2e8f0; padding: 18px; border-radius: 14px; text-align: left; font-size: 13px; margin: 25px 0; color: #0f172a; }
                    .row { display: flex; justify-content: space-between; margin: 8px 0; font-weight: 500; }
                    .pay-btn { width: 100%; background: #a78bfa; color: #0b0f19; border: none; padding: 15px; font-size: 14px; font-weight: 700; border-radius: 12px; cursor: pointer; transition: 0.2s; text-transform: uppercase; animation: pulse 2s infinite; }
                    .pay-btn:hover { background: #ffffff; animation: none; transform: translateY(-1px); }
                    @keyframes fIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
                    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(167,139,250,0.4); } 70% { box-shadow: 0 0 0 10px rgba(167,139,250,0); } 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); } }
                </style>
            </head>
            <body>
                <div class="card">
                    <h3 style="margin:0; color:#ffffff; font-size:20px; font-weight:700;">Checkout Invoice</h3>
                    <p style="margin:5px 0 0 0; font-size:12px; color:#94a3b8;">Transaction Node Initialized</p>
                    <div class="invoice">
                        <div class="row"><span>File Format:</span><b>${displayType}</b></div>
                        <div class="row"><span>Total Pages:</span><b>${totalPages}</b></div>
                        <div style="border-top: 1px dashed #cbd5e1; margin: 12px 0;"></div>
                        <div class="row" style="font-size:15px; font-weight: 700;"><span>Grand Total:</span><span style="color:#7c3aed;">₹${totalCost}</span></div>
                    </div>
                    <button id="rzp-button" class="pay-btn">Pay via UPI / Card 💳</button>
                    <br><br><a href="/print?id=${printerId}" style="color: #ef4444; font-size: 13px; text-decoration: none; font-weight: 600;">Cancel Order</a>
                </div>
                <script>
                    var options = {
                        "key": "${RAZORPAY_KEY_ID}", "amount": "${amountInPaise}", "currency": "INR", "name": "Instaprint Network",
                        "handler": function (response){
                            var form = document.createElement('form'); form.method = 'POST'; form.action = '/trigger-print';
                            var inputs = { 'fileName': '${req.file.filename}', 'printerId': '${printerId}', 'format': '${fileType}', 'cost': '${totalCost}' };
                            for (var key in inputs) {
                                var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = inputs[key]; form.appendChild(input);
                            }
                            document.body.appendChild(form); form.submit();
                        },
                        "theme": { "color": "#7c3aed" }
                    };
                    var rzp1 = new window.Razorpay(options);
                    document.getElementById('rzp-button').onclick = function(e){ rzp1.open(); e.preventDefault(); }
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).send("Error compiling invoice.");
    }
});

// 4. प्रिंटर ट्रिगर
app.use(express.urlencoded({ extended: true }));
app.post('/trigger-print', async (req, res) => {
    const { fileName, printerId, format, cost } = req.body;
    const filePath = path.join(__dirname, 'uploads', fileName);
    if (!fs.existsSync(filePath)) return res.send("Error: Session Expired.");
    try {
        io.emit('new-print-job', { printerName: printers[printerId].name, format: format.includes('pdf') ? 'PDF' : 'IMAGE', cost: cost });
        await ptp.print(filePath); fs.unlinkSync(filePath);
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, system-ui, sans-serif; background-color: #0b0f19; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; margin: 0; }
                    .card { background: #131a2c; max-width: 400px; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(124, 58, 237, 0.1); border: 1px solid #1e293b; text-align: center; animation: pop 0.3s cubic-bezier(0.18, 0.9, 0.3, 1.2); }
                    @keyframes pop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                </style>
            </head>
            <body>
                <div class="card">
                    <span style="font-size: 50px; display:block; margin-bottom:15px;">🖨️🎉</span>
                    <h2 style="color: #ffffff; font-weight:700;">Printing Started!</h2>
                    <p style="color: #94a3b8; font-size: 14px; line-height: 1.5; margin-top: 10px;">Your transaction has been settled. Please collect sheets from the tray.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Printing failed."); }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { console.log('🚀 Premium App listening on port ' + PORT); });
