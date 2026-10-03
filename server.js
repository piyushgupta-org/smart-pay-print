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
    "PRINTER_01": { name: "Library LaserJet", location: "First Floor", pdfPrice: 5, photoPrice: 10 },
    "PRINTER_02": { name: "Lab Color Printer", location: "Ground Floor", pdfPrice: 8, photoPrice: 15 },
    "PRINTER_03": { name: "Canteen Area Printer", location: "Canteen", pdfPrice: 5, photoPrice: 10 }
};

// 1. दुकानदार का लाइव डैशबोर्ड (Navy Blue और Deep Purple डार्क थीम)
app.get('/dashboard', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Merchant Live Monitor</title>
            <script src="/socket.io/socket.io.js"></script>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #0b0f19; color: #ffffff; }
                .card { background: #131a2c; max-width: 500px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0px 0px 20px rgba(124, 58, 237, 0.2); border: 2px solid #7c3aed; }
                h2 { color: #a78bfa; margin: 0 0 10px 0; }
                hr { border: 0; border-top: 1px solid #1e293b; margin: 20px 0; }
                .job-item { background: #0f172a; padding: 12px; margin: 10px 0; border-radius: 6px; border-left: 5px solid #a78bfa; display: flex; justify-content: space-between; align-items: center; border: 1px solid #3b0764; border-left: 5px solid #a78bfa; }
                .job-price { color: #a78bfa; font-weight: bold; font-size: 18px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🖨️ Shopkeeper Live Print Monitor</h2>
                <p style="color: #94a3b8; font-size: 13px;">Status: <span style="color: #a78bfa; font-weight: bold;">● Active & Listening</span></p>
                <hr>
                <div style="text-align: left;">
                    <h3 style="color: #cbd5e1;">Incoming Print Queue:</h3>
                    <ul id="print-list" style="list-style-type: none; padding: 0;">
                        <li id="no-jobs" style="color: #64748b; font-style: italic; text-align: center; padding: 20px;">Waiting for verified user bank payments...</li>
                    </ul>
                </div>
            </div>
            <script>
                const socket = io();
                socket.on('new-print-job', (data) => {
                    const noJobs = document.getElementById('no-jobs');
                    if(noJobs) noJobs.remove();
                    const list = document.getElementById('print-list');
                    const item = document.createElement('li');
                    item.className = "job-item";
                    item.innerHTML = '<div><b style="color:#ffffff;">' + data.printerName + '</b> <span style="color:#94a3b8; font-size:12px;">(' + data.format + ')</span></div><div class="job-price">₹' + data.cost + '</div>';
                    list.prepend(item);
                    const audio = new AudioContext(); const osc = audio.createOscillator();
                    osc.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.1);
                });
            </script>
        </body>
        </html>
    `);
});
// 2. यूजर का होम पेज (Smart Pay-Per-Print Hub - Black, Purple & Navy Blue Theme)
app.get('/print', (req, res) => {
    const printerId = req.query.id || "PRINTER_01"; 
    const activePrinter = printers[printerId] || printers["PRINTER_01"];

    res.send(`
        <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #0b0f19; color: #ffffff;">
            <div style="background: #131a2c; max-width: 400px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0px 0px 20px rgba(124, 58, 237, 0.15); border: 1px solid #1e293b; border-top: 5px solid #7c3aed;">
                <h2 style="color: #ffffff; margin: 0 0 5px 0;">Smart Pay-Per-Print Hub 🖨️✨</h2>
                <p style="font-size: 13px; color: #a78bfa; margin: 0 0 15px 0;">Connected to: <b>${activePrinter.name}</b></p>
                <p style="font-size: 12px; color: #94a3b8; margin: 5px 0;">Location: <b>${activePrinter.location}</b></p>
                
                <div style="background: #0f172a; padding: 12px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-around; color: #cbd5e1; margin: 20px 0; border: 1px solid #1e293b;">
                    <div>📄 PDF: <b style="color: #a78bfa;">₹${activePrinter.pdfPrice}/page</b></div>
                    <div style="width: 1px; background: #334155;"></div>
                    <div>🖼️ Photo: <b style="color: #a78bfa;">₹${activePrinter.photoPrice}/photo</b></div>
                </div>
                
                <form action="/upload?id=${printerId}" method="POST" enctype="multipart/form-data" style="margin-top: 25px;">
                    <input type="file" name="document" accept="application/pdf, image/*" required style="margin-bottom: 20px; color: #94a3b8; font-size: 14px;" /><br>
                    <button type="submit" style="padding: 12px 24px; font-size: 15px; background-color: #7c3aed; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);">Upload & Calculate</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 3. यूजर का पेमेंट पेज (विद रेज़रपे लाइव सपोर्ट)
app.post('/upload', upload.single('document'), async (req, res) => {
    let filePath = "";
    try {
        if (!req.file) return res.status(400).send("No file uploaded.");
        const printerId = req.query.id;
        const activePrinter = printers[printerId] || printers["PRINTER_01"];
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
                <title>Secure Payment</title>
                <script src="https://razorpay.com"></script>
            </head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #0b0f19; color: #ffffff;">
                <div style="background: #131a2c; max-width: 400px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0px 0px 20px rgba(124, 58, 237, 0.15); border: 1px solid #1e293b;">
                    <h2 style="color: #34d399; margin: 0 0 15px 0;">Calculation Success! ✅</h2>
                    <div style="text-align: left; background: #0f172a; padding: 15px; border-radius: 8px; font-size: 14px; color: #cbd5e1; margin-bottom: 25px; line-height: 1.6; border: 1px solid #1e293b;">
                        <p style="margin: 4px 0;">Format: <b style="color: #ffffff;">${displayType}</b></p>
                        <p style="margin: 4px 0;">Total Pages/Items: <b style="color: #ffffff;">${totalPages}</b></p>
                        <p style="margin: 4px 0; font-size: 16px;">Total Amount: <span style="color: #34d399;"><b>₹${totalCost}</b></span></p>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #1e293b; margin: 20px 0;">
                    <button id="rzp-button" style="padding: 14px 20px; font-size: 15px; background-color: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">Pay Securely via UPI / Card 💳</button>
                    <br><br>
                    <a href="/print?id=${printerId}" style="color: #f87171; text-decoration: none; font-size: 13px; font-weight: bold;">Cancel Order</a>
                </div>
                <script>
                    var options = {
                        "key": "${RAZORPAY_KEY_ID}", "amount": "${amountInPaise}", "currency": "INR", "name": "Instaprint Network",
                        "description": "Real-Time Print Automation Node",
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

// 4. प्रिंटर ट्रिगर और लाइव अलर्ट
app.use(express.urlencoded({ extended: true }));
app.post('/trigger-print', async (req, res) => {
    const { fileName, printerId, format, cost } = req.body;
    const filePath = path.join(__dirname, 'uploads', fileName);
    const activePrinter = printers[printerId] || printers["PRINTER_01"];
    if (!fs.existsSync(filePath)) return res.send("Error: Session Expired.");
    try {
        io.emit('new-print-job', { printerName: activePrinter.name, format: format.includes('pdf') ? 'PDF' : 'IMAGE', cost: cost });
        await ptp.print(filePath); fs.unlinkSync(filePath);
        res.send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #0b0f19; color: #ffffff; display: flex; align-items: center; justify-content: center; min-h: screen;">
                <div style="background: #131a2c; max-width: 400px; padding: 40px; border-radius: 12px; box-shadow: 0 10px 30px rgba(124, 58, 237, 0.1); border: 1px solid #1e293b; text-align: center;">
                    <span style="font-size: 50px;">🖨️🎉</span>
                    <h2 style="color: #34d399; margin-top: 15px;">Printing Started!</h2>
                    <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">Your payment has been securely settled. Please collect your documents from the output tray.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Printing failed."); }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { console.log('🚀 Premium App listening on port ' + PORT); });

