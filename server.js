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

// 1. दुकानदार का लाइव डैशबोर्ड (साफ-सुथरा प्रीमियम लाइट थीम)
app.get('/dashboard', (req, res) => {
    res.send(`
        <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f4f6fa; color: #1e293b;">
            <div style="background: white; max-width: 500px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0px 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                <h2 style="color: #0f172a; margin: 0 0 10px 0;">🖨️ Shopkeeper Live Print Monitor</h2>
                <p style="color: #64748b; font-size: 13px; margin: 0;">Status: <span style="color: #7c3aed; font-weight: bold;">● Active & Listening</span></p>
                <hr style="border:0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <div style="text-align: left;">
                    <h3 style="color: #1e293b; font-size: 16px;">Incoming Print Queue:</h3>
                    <ul id="print-list" style="list-style-type: none; padding: 0;">
                        <li id="no-jobs" style="color: #94a3b8; font-style: italic; text-align: center; padding: 20px;">Waiting for verified user bank payments...</li>
                    </ul>
                </div>
            </div>
            <script>
                const socket = io();
                socket.on('new-print-job', (data) => {
                    const noJobs = document.getElementById('no-jobs'); if(noJobs) noJobs.remove();
                    const list = document.getElementById('print-list'); const item = document.createElement('li');
                    item.style.background = '#f8fafc'; item.style.padding = '14px'; item.style.margin = '10px 0';
                    item.style.borderRadius = '8px'; item.style.borderLeft = '5px solid #7c3aed';
                    item.style.borderTop = '1px solid #e2e8f0'; item.style.borderRight = '1px solid #e2e8f0';
                    item.style.borderBottom = '1px solid #e2e8f0'; item.style.display = 'flex'; item.style.justifyContent = 'space-between'; item.style.alignItems = 'center';
                    item.innerHTML = '<div><b style="color:#0f172a; font-size:14px;">' + data.printerName + '</b> <span style="color:#64748b; font-size:12px;">(' + data.format + ')</span></div><div style="color:#7c3aed; font-weight:bold; font-size:16px;">Math.round(₹' + data.cost + ')</div>';
                    list.prepend(item);
                    const audio = new AudioContext(); const osc = audio.createOscillator();
                    osc.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.1);
                });
            </script>
        </body>
        </html>
    `);
});
// 2. यूजर का होम पेज (Smart Pay-Per-Print Hub - सुंदर लाइट थीम)
app.get('/print', (req, res) => {
    const printerId = req.query.id || "PRINTER_01"; 
    const activePrinter = printers[printerId] || printers["PRINTER_01"];

    res.send(`
        <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f4f6fa; color: #1e293b;">
            <div style="background: white; max-width: 400px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0px 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; border-top: 5px solid #7c3aed;">
                <h2 style="color: #0f172a; margin: 0 0 5px 0;">Smart Pay-Per-Print Hub 🖨️✨</h2>
                <p style="font-size: 13px; color: #1d4ed8; margin: 0 0 15px 0; font-weight: bold;">Connected to: ${activePrinter.name}</p>
                <p style="font-size: 12px; color: #64748b; margin: 5px 0;">Location: <b>${activePrinter.location}</b></p>
                
                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-around; color: #475569; margin: 20px 0; border: 1px solid #e2e8f0;">
                    <div>📄 PDF: <b style="color: #7c3aed;">₹${activePrinter.pdfPrice}/page</b></div>
                    <div style="width: 1px; background: #cbd5e1;"></div>
                    <div>🖼️ Photo: <b style="color: #7c3aed;">₹${activePrinter.photoPrice}/photo</b></div>
                </div>
                
                <form action="/upload?id=${printerId}" method="POST" enctype="multipart/form-data" style="margin-top: 25px;">
                    <input type="file" name="document" accept="application/pdf, image/*" required style="margin-bottom: 20px; color: #475569; font-size: 14px;" /><br>
                    <button type="submit" style="padding: 12px 24px; font-size: 15px; background-color: #7c3aed; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);">Upload & Calculate</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 3. यूजर का लाइट पेमेंट पेज (विद रेज़रपे लाइव सपोर्ट)
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
                <title>Secure Payment</title>
                <script src="https://razorpay.com"></script>
            </head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f4f6fa; color: #1e293b;">
                <div style="background: white; max-width: 400px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0px 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <h2 style="color: #10b981; margin: 0 0 15px 0;">Calculation Success! ✅</h2>
                    <div style="text-align: left; background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 14px; color: #475569; margin-bottom: 25px; line-height: 1.6; border: 1px solid #e2e8f0;">
                        <p style="margin: 4px 0;">Format: <b style="color: #0f172a;">${displayType}</b></p>
                        <p style="margin: 4px 0;">Total Pages/Items: <b style="color: #0f172a;">${totalPages}</b></p>
                        <p style="margin: 4px 0; font-size: 16px;">Total Amount: <span style="color: #10b981;"><b>₹${totalCost}</b></span></p>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <button id="rzp-button" style="padding: 14px 20px; font-size: 15px; background-color: #1d4ed8; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; box-shadow: 0 4px 12px rgba(29, 78, 216, 0.2);">Pay Securely via UPI / Card 💳</button>
                    <br><br>
                    <a href="/print?id=${printerId}" style="color: #ef4444; text-decoration: none; font-size: 13px; font-weight: bold;">Cancel Order</a>
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
                        "theme": { "color": "#1d4ed8" }
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
            <body style="font-family: Arial, sans-serif; background-color: #f4f6fa; display: flex; align-items: center; justify-content: center; min-h: screen; padding: 50px;">
                <div style="background: white; max-width: 400px; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; text-align: center;">
                    <span style="font-size: 50px;">🖨️🎉</span>
                    <h2 style="color: #10b981; margin-top: 15px;">Printing Started!</h2>
                    <p style="color: #64748b; font-size: 14px; line-height: 1.5;">Your payment has been securely settled. Please collect your sheets from the printer output tray.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Printing failed."); }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { console.log('🚀 Premium App listening on port ' + PORT); });
