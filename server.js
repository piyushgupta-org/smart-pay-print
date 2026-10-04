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
const RAZORPAY_KEY_ID = "rzp_live_TjkxhC57dqHugH"; 

const printers = {
    "PRINTER_01": { name: "Central Library LaserJet", location: "Block A, 1st Floor", pdfPrice: 5, photoPrice: 10 },
    "PRINTER_02": { name: "Tech Lab Color Printer", location: "Lab 3, Ground Floor", pdfPrice: 8, photoPrice: 15 },
    "PRINTER_03": { name: "Canteen Kiosk Printer", location: "Cafeteria Zone", pdfPrice: 5, photoPrice: 10 }
};
// प्रिंटर पैकेज को रेंडर के क्लाउड सर्वर पर क्रैश होने से बचाने के लिए सेफ चेक
const isRenderCloud = process.env.RENDER === 'true';

// 1. दुकानदार का प्रीमियम लाइव डैशबोर्ड (Cosmic Neon Light Mix)
app.get('/dashboard', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Merchant Live Monitor | Smart Pay-Per-Print Hub</title>
            <script src="/socket.io/socket.io.js"></script>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    background-color: #030712; 
                    background-image: 
                        radial-gradient(at 0% 0%, rgba(124, 58, 237, 0.25) 0px, transparent 50%), 
                        radial-gradient(at 100% 100%, rgba(79, 70, 229, 0.25) 0px, transparent 50%),
                        linear-gradient(135deg, #030712 0%, #090514 100%);
                    color: #1e293b; padding: 40px; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 90vh; 
                }
                .card { background: #ffffff; max-width: 600px; width: 100%; padding: 35px; border-radius: 24px; box-shadow: 0px 25px 60px rgba(0, 0, 0, 0.5), 0px 0px 40px rgba(124, 58, 237, 0.1); border: 1px solid rgba(255,255,255,0.8); border-top: 6px solid #7c3aed; animation: fadeIn 0.4s ease-out; position: relative; overflow: hidden; }
                h2 { color: #0f172a; margin: 0 0 5px 0; display: flex; justify-content: space-between; align-items: center; font-size: 24px; font-weight: 700; }
                .status-badge { font-size: 11px; background: #e0e7ff; color: #4f46e5; padding: 6px 14px; border-radius: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #c7d2fe; }
                hr { border: 0; border-top: 1px solid #f1f5f9; margin: 25px 0; }
                .job-item { background: #f8fafc; color: #0f172a; padding: 18px; margin: 12px 0; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.01); border: 1px solid #f1f5f9; border-left: 5px solid #7c3aed; transition: all 0.2s ease; animation: slideUp 0.3s ease-out; }
                .job-item:hover { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(124, 58, 237, 0.08); }
                .job-price { background: linear-gradient(135deg, #7c3aed, #4f46e5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; font-size: 20px; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🖨️ Live Print Monitor <span class="status-badge">● Online</span></h2>
                <p style="color: #64748b; font-size: 13px; margin: 0;">Smart Pay-Per-Print Hub — Real-time Node Status</p>
                <hr>
                <h3 style="color: #7c3aed; font-size: 15px; font-weight: 600; margin-bottom: 15px;">Active Queue Stream:</h3>
                <ul id="print-list" style="list-style-type: none; padding: 0; margin: 0;">
                    <li id="no-jobs" style="color: #94a3b8; font-style: italic; text-align: center; padding: 40px; font-size: 14px;">Waiting for verified user payments...</li>
                </ul>
            </div>
            <script>
                const socket = io();
                socket.on('new-print-job', (data) => {
                    const noJobs = document.getElementById('no-jobs');
                    if(noJobs) noJobs.remove();
                    const list = document.getElementById('print-list');
                    const item = document.createElement('li');
                    item.className = "job-item";
                    item.innerHTML = '<div><b style="font-size:14px; font-weight:600; color:#0f172a;">' + data.printerName + '</b><br><span style="color:#64748b; font-size:12px;">Format: ' + data.format + '</span></div><div class="job-price">₹' + data.cost + '</div>';
                    list.prepend(item);
                    const audio = new AudioContext(); const osc = audio.createOscillator();
                    osc.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.15);
                });
            </script>
        </body>
        </html>
    `);
});
// 2. ग्राहक का आकर्षक मोबाइल अपलोड पेज
app.get('/print', (req, res) => {
    const printerId = req.query.id || "PRINTER_01"; 
    const activePrinter = printers[printerId] || printers["PRINTER_01"];
    res.send(`
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Smart Pay-Per-Print Hub</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    background-color: #030712; 
                    background-image: 
                        radial-gradient(at 0% 0%, rgba(124, 58, 237, 0.25) 0px, transparent 50%), 
                        radial-gradient(at 100% 100%, rgba(79, 70, 229, 0.25) 0px, transparent 50%),
                        linear-gradient(135deg, #030712 0%, #090514 100%);
                    display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; margin: 0; 
                }
                .card { background: #ffffff; max-width: 400px; width: 100%; padding: 35px; border-radius: 24px; box-shadow: 0px 25px 60px rgba(0, 0, 0, 0.5), 0px 0px 40px rgba(124, 58, 237, 0.1); border: 1px solid rgba(255,255,255,0.8); text-align: center; border-top: 6px solid #7c3aed; animation: fadeIn 0.4s ease-out; }
                h2 { color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 700; }
                .loc-tag { font-size: 12px; color: #7c3aed; font-weight: 600; margin-bottom: 20px; display: inline-block; background: #f3e8ff; padding: 5px 16px; border-radius: 20px; border: 1px solid #e9d5ff; }
                .rates-box { background: #f8fafc; padding: 14px; border-radius: 14px; font-size: 13px; display: flex; justify-content: space-around; color: #334155; margin: 20px 0; font-weight: 600; border: 1px solid #f1f5f9; }
                .file-custom { border: 2px dashed #cbd5e1; padding: 35px 20px; border-radius: 16px; background: #f8fafc; cursor: pointer; display: block; margin-bottom: 25px; transition: all 0.2s ease; }
                .file-custom:hover { border-color: #7c3aed; background: #f5f3ff; transform: scale(1.01); }
                .upload-btn { width: 100%; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #ffffff; border: none; padding: 15px; font-size: 14px; font-weight: 700; border-radius: 14px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 6px 20px rgba(124, 58, 237, 0.3); text-transform: uppercase; letter-spacing: 0.5px; }
                .upload-btn:hover { background: linear-gradient(135deg, #6d28d9, #4338ca); transform: translateY(-1px); box-shadow: 0 8px 25px rgba(124, 58, 237, 0.4); }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Smart Pay-Per-Print Hub 🖨️</h2>
                <div class="loc-tag">📍 ${activePrinter.location}</div>
                <p style="font-size:12px; color:#64748b; margin:0 0 15px 0;">Device: <b>${activePrinter.name}</b></p>
                <div class="rates-box">
                    <div>📄 PDF: <span style="color:#7c3aed;"><b>₹${activePrinter.pdfPrice}/pg</b></span></div>
                    <div style="width: 1px; background: #e2e8f0;"></div>
                    <div>🖼️ Photo: <span style="color:#7c3aed;"><b>₹${activePrinter.photoPrice}/img</b></span></div>
                </div>
                <form action="/upload?id=${printerId}" method="POST" enctype="multipart/form-data">
                    <label class="file-custom">
                        <input type="file" name="document" accept="application/pdf, image/*" required style="display:none;" id="file-in"/>
                        <span style="font-size:35px; display:block;">📂</span>
                        <span style="display:block; font-size:13px; font-weight:600; margin-top:10px; color:#64748b;" id="file-lbl">Tap to Select Document</span>
                    </label>
                    <button type="submit" class="upload-btn">Process Invoice</button>
                </form>
            </div>
            <script>
                document.getElementById('file-in').addEventListener('change', function(e) {
                    if(e.target.files.length > 0) {
                        document.getElementById('file-lbl').innerText = e.target.files.name;
                        document.getElementById('file-lbl').style.color = '#7c3aed';
                    }
                });
            </script>
        </body>
        </html>
    `);
});
app.post('/upload', upload.single('document'), async (req, res) => {
    let filePath = "";
    try {
        if (!req.file) return res.status(400).send("No file uploaded.");
        const printerId = req.query.id;
        const activePrinter = printers[printerId] || printers["PRINTER_01"];
        filePath = path.join(__dirname, 'uploads', req.file.filename);
        
        const originalFileName = req.file.originalname;
        let totalPages = 1; 
        let totalCost = 0; 
        let fileType = req.file.mimetype; 
        let displayType = "PDF Document";

        if (fileType === 'application/pdf') {
            const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
            const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
            const pdf = await loadingTask.promise;
            totalPages = pdf.numPages; 
            totalCost = totalPages * activePrinter.pdfPrice;
        } else if (fileType.startsWith('image/')) {
            displayType = "Image/Photo"; 
            totalCost = activePrinter.photoPrice;
            const processedPhotoPath = filePath + '_converted.png';
            await sharp(filePath).resize(2480, 3508, { fit: 'inside' }).toFile(processedPhotoPath);
            fs.unlinkSync(filePath); 
            filePath = processedPhotoPath;
        }
        const amountInPaise = totalCost * 100;
        
        // असली रेज़रपे पेमेंट गेटवे स्क्रीन (Premium Cosmic Neon Theme)
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Secure Checkout | Smart Pay-Per-Print Hub</title>
                <script src="https://razorpay.com"></script>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                        background-color: #030712; 
                        background-image: 
                            radial-gradient(at 0% 0%, rgba(124, 58, 237, 0.25) 0px, transparent 50%), 
                            radial-gradient(at 100% 100%, rgba(79, 70, 229, 0.25) 0px, transparent 50%),
                            linear-gradient(135deg, #030712 0%, #090514 100%);
                        display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; margin: 0; 
                    }
                    .card { background: #ffffff; max-width: 400px; width: 100%; padding: 35px; border-radius: 24px; box-shadow: 0px 25px 60px rgba(0, 0, 0, 0.5), 0px 0px 40px rgba(124, 58, 237, 0.1); border: 1px solid rgba(255,255,255,0.8); text-align: center; animation: fadeIn 0.3s ease-out; }
                    .invoice-box { background: #f8fafc; border: 1px solid #f1f5f9; padding: 18px; border-radius: 16px; text-align: left; font-size: 13px; margin: 25px 0; color: #334155; }
                    .row { display: flex; justify-content: space-between; margin: 8px 0; font-weight: 500; }
                    .pay-btn { width: 100%; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #ffffff; border: none; padding: 15px; font-size: 14px; font-weight: 700; border-radius: 14px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 6px 20px rgba(124, 58, 237, 0.3); text-transform: uppercase; letter-spacing: 0.5px; }
                    .pay-btn:hover { background: linear-gradient(135deg, #6d28d9, #4338ca); transform: translateY(-1px); box-shadow: 0 8px 25px rgba(124, 58, 237, 0.4); }
                </style>
            </head>
            <body>
                <div class="card">
                    <h3 style="margin:0; color:#0f172a; font-size:20px; font-weight:700;">Checkout Invoice</h3>
                    <p style="margin:5px 0 0 0; font-size:12px; color:#64748b;">Smart Pay-Per-Print Secure Gateway</p>
                    <div class="invoice-box">
                        <div class="row"><span style="margin-right: 10px;">File Name:</span><b style="color:#0f172a; word-break: break-all; text-align: right;">${originalFileName}</b></div>
                        <div class="row"><span>Format:</span><b style="color:#0f172a;">${displayType}</b></div>
                        <div class="row"><span>Total Pages:</span><b style="color:#0f172a;">${totalPages}</b></div>
                        <div style="border-top: 1px dashed #cbd5e1; margin: 12px 0;"></div>
                        <div class="row" style="font-size:16px; font-weight: 800;"><span>Grand Total:</span><span style="color:#7c3aed;">₹${totalCost}</span></div>
                    </div>
                    <button id="rzp-button" class="pay-btn">Pay via UPI / Card 💳</button>
                    <br><br>
                    <a href="/print?id=${printerId}" style="color: #ef4444; font-size: 13px; text-decoration: none; font-weight: 600;">Cancel Order</a>
                </div>
                <script>
                    var options = {
                        "key": "${RAZORPAY_KEY_ID}", 
                        "amount": "${amountInPaise}", 
                        "currency": "INR", 
                        "name": "Smart Pay-Per-Print Hub",
                        "description": "Real-Time Print Automation Node",
                        "handler": function (response){
                            var form = document.createElement('form'); 
                            form.method = 'POST'; 
                            form.action = '/trigger-print';
                            var inputs = { 'fileName': '${req.file.filename}', 'printerId': '${printerId}', 'format': '${fileType}', 'cost': '${totalCost}' };
                            for (var key in inputs) {
                                var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = inputs[key]; form.appendChild(input);
                            }
                            document.body.appendChild(form); 
                            form.submit();
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

app.use(express.urlencoded({ extended: true }));
app.post('/trigger-print', async (req, res) => {
    const { fileName, printerId, format, cost } = req.body;
    const filePath = path.join(__dirname, 'uploads', fileName);
    const activePrinter = printers[printerId] || printers["PRINTER_01"];
    if (!fs.existsSync(filePath)) return res.send("Error: Session Expired.");
    try {
        io.emit('new-print-job', { printerName: activePrinter.name, format: format.includes('pdf') ? 'PDF' : 'IMAGE', cost: cost });
        
        // रेंडर क्लाउड पर होने पर लोकल ड्राइवर स्किप होगा ताकि क्रैश न हो
        const isRenderCloud = process.env.RENDER === 'true';
        if (!isRenderCloud) {
            await ptp.print(filePath);
        }
        
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Success | Smart Pay-Per-Print Hub</title>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                        background-color: #030712; 
                        background-image: linear-gradient(135deg, #030712 0%, #090514 100%);
                        display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; 
                    }
                    .card { background: #ffffff; padding: 40px; border-radius: 24px; text-align: center; border-top: 6px solid #22c55e; box-shadow: 0px 25px 60px rgba(0, 0, 0, 0.5); }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Payment Successful! 🎉</h2>
                    <p style="color:#64748b;">Your transaction has been securely settled. Request routed to the spooler tray successfully.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Printing failed."); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { console.log('🚀 Server active on port ' + PORT); });
