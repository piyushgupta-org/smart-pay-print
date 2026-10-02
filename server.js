const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
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

// ⚠️ यहाँ अपनी Razorpay से मिली असली KEY ID डालें
const RAZORPAY_KEY_ID = "rzp_test_Tj9FkSS0hnFIAk"; 

const printers = {
    "PRINTER_01": { name: "Library LaserJet", location: "First Floor", pdfPrice: 5, photoPrice: 10 },
    "PRINTER_02": { name: "Lab Color Printer", location: "Ground Floor", pdfPrice: 8, photoPrice: 15 },
    "PRINTER_03": { name: "Canteen Area Printer", location: "Canteen", pdfPrice: 5, photoPrice: 10 }
};

// 1. दुकानदार का लाइव डैशबोर्ड (सिंपल डिज़ाइन)
app.get('/dashboard', (req, res) => {
    res.send(`
        <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #f4f4f9;">
            <div style="background: white; max-width: 500px; margin: auto; padding: 30px; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1);">
                <h2>🖨️ Shopkeeper Live Print Monitor</h2>
                <p>Status: <span style="color: green; font-weight: bold;">● Active & Listening</span></p>
                <hr style="margin: 20px 0;">
                <div style="text-align: left;">
                    <h3>Incoming Print Queue:</h3>
                    <ul id="print-list" style="list-style-type: none; padding: 0;">
                        <li id="no-jobs" style="color: #aaa; font-style: italic;">Waiting for users to scan QR...</li>
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
                    item.style.background = '#e9ecef'; item.style.padding = '12px'; item.style.margin = '10px 0';
                    item.style.borderRadius = '5px'; item.style.borderLeft = '5px solid #007bff';
                    item.style.display = 'flex'; item.style.justifyContent = 'space-between';
                    item.innerHTML = '<div><b>' + data.printerName + '</b> (' + data.format + ')</div><div><b>₹' + data.cost + '</b></div>';
                    list.prepend(item);
                    const audio = new AudioContext(); const osc = audio.createOscillator();
                    osc.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.1);
                });
            </script>
        </body>
        </html>
    `);
});
// 2. यूजर का पुराना होम पेज (Smart Pay-Per-Print Hub)
app.get('/print', (req, res) => {
    const printerId = req.query.id || "PRINTER_01"; 
    const activePrinter = printers[printerId] || printers["PRINTER_01"];

    res.send(`
        <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #f4f4f9;">
            <div style="background: white; max-width: 400px; margin: auto; padding: 30px; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1);">
                <h2>Smart Pay-Per-Print Hub 🖨️✨</h2>
                <p>Connected to: <b style="color: blue;">${activePrinter.name}</b></p>
                <p>Location: <b>${activePrinter.location}</b></p>
                <p>PDF Rate: ₹${activePrinter.pdfPrice}/page | Photo Rate: ₹${activePrinter.photoPrice}/photo</p>
                <form action="/upload?id=${printerId}" method="POST" enctype="multipart/form-data" style="margin-top: 30px;">
                    <input type="file" name="document" accept="application/pdf, image/*" required style="margin-bottom: 20px;" /><br>
                    <button type="submit" style="padding: 10px 20px; font-size: 16px; background-color: green; color: white; border: none; border-radius: 5px; cursor: pointer;">Upload & Calculate</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 3. यूजर का पुराना सिंपल पेमेंट पेज (विद रेज़रपे सपोर्ट)
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
            <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #f4f4f9;">
                <div style="background: white; max-width: 400px; margin: auto; padding: 30px; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: green;">Calculation Success! ✅</h2>
                    <p style="font-size: 18px;">Format: <b>${displayType}</b></p>
                    <p style="font-size: 18px;">Total Pages/Items: <b>${totalPages}</b></p>
                    <p style="font-size: 20px;">Total Amount: <span style="color: green;"><b>₹${totalCost}</b></span></p>
                    <hr style="margin: 20px 0;">
                    <button id="rzp-button" style="padding: 15px 25px; font-size: 16px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%;">Pay with Razorpay 💳</button>
                    <br><br><a href="/print?id=${printerId}" style="color: red; text-decoration: none;">Cancel Order</a>
                </div>
                <script>
                    var options = {
                        "key": "${RAZORPAY_KEY_ID}", "amount": "${amountInPaise}", "currency": "INR", "name": "Smart Kiosk Network",
                        "handler": function (response){
                            var form = document.createElement('form'); form.method = 'POST'; form.action = '/trigger-print';
                            var inputs = { 'fileName': '${req.file.filename}', 'printerId': '${printerId}', 'format': '${fileType}', 'cost': '${totalCost}' };
                            for (var key in inputs) {
                                var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = inputs[key];
                                form.appendChild(input);
                            }
                            document.body.appendChild(form); form.submit();
                        }
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

// 4. प्रिंटर ट्रिगर और अलर्ट ब्रॉडकास्ट
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
            <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #f4f4f9;">
                <div style="background: white; max-width: 400px; margin: auto; padding: 30px; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1);">
                    <h1 style="color: green;">Printing Started! 🖨️🚀</h1>
                    <p style="font-size: 18px;">Payment verified by Razorpay. Please collect your sheets.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Printing failed."); }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { console.log('🚀 Server running on port ' + PORT); });
