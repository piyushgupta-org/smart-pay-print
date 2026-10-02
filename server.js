const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const ptp = require('pdf-to-printer'); 
const sharp = require('sharp');
const http = require('http'); // HTTP मॉड्यूल जोड़ा
const { Server } = require('socket.io'); // Socket.io जोड़ा

const app = express();
const server = http.createServer(app);
const io = new Server(server); // लाइव कनेक्शन इंजन

const upload = multer({ dest: path.join(__dirname, 'uploads/') });

if (!fs.existsSync(path.join(__dirname, 'uploads'))){
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

const printers = {
    "PRINTER_01": { name: "Library LaserJet", location: "First Floor", pdfPrice: 5, photoPrice: 10 },
    "PRINTER_02": { name: "Lab Color Printer", location: "Ground Floor", pdfPrice: 8, photoPrice: 15 },
    "PRINTER_03": { name: "Canteen Area Printer", location: "Canteen", pdfPrice: 5, photoPrice: 10 }
};

// 1. दुकान वाले (Shopkeeper) का लाइव डैशबोर्ड पेज
app.get('/dashboard', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Shopkeeper Live Dashboard</title>
            <script src="/socket.io/socket.io.js"></script>
        </head>
        <body style="font-family: Arial; padding: 30px; background-color: #222; color: white;">
            <h2>🖨️ Shopkeeper Live Print Monitor</h2>
            <p>Status: <span style="color: #00ff00; font-weight: bold;">● Active & Listening</span></p>
            <hr style="border-color: #444;">
            
            <div style="background: #333; padding: 20px; border-radius: 8px;">
                <h3>Incoming Print Queue:</h3>
                <ul id="print-list" style="list-style-type: none; padding: 0;">
                    <li style="color: #aaa; font-style: italic;">No active prints right now... Waiting for users to scan QR.</li>
                </ul>
            </div>

            <script>
                const socket = io();
                // जैसे ही कोई यूजर प्रिंट कमांड भेजेगा, यहाँ लाइव डेटा बिना पेज रीफ्रेश हुए आ जाएगा
                socket.on('new-print-job', (data) => {
                    const list = document.getElementById('print-list');
                    if(list.innerText.includes('No active prints')) { list.innerHTML = ''; }
                    
                    const item = document.createElement('li');
                    item.style.background = '#444';
                    item.style.padding = '12px';
                    item.style.margin = '10px 0';
                    item.style.borderRadius = '5px';
                    item.style.borderLeft = '5px solid #007bff';
                    item.innerHTML = '🔔 <b>New Job Received!</b><br>Printer: ' + data.printerName + ' | Format: ' + data.format + ' | Cost: ₹' + data.cost;
                    list.prepend(item);
                    
                    // ऑडियो बीप साउंड अलर्ट
                    const audio = new AudioContext();
                    const osc = audio.createOscillator();
                    osc.connect(audio.destination);
                    osc.start(); osc.stop(audio.currentTime + 0.1);
                });
            </script>
        </body>
        </html>
    `);
});

// 2. होम पेज (यूजर अपलोड फॉर्म)
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
                <p style="font-size: 14px; color: #555;">PDF Rate: ₹${activePrinter.pdfPrice}/page | Photo Rate: ₹${activePrinter.photoPrice}/photo</p>
                
                <form action="/upload?id=${printerId}" method="POST" enctype="multipart/form-data" style="margin-top: 30px;">
                    <input type="file" name="document" accept="application/pdf, image/*" required style="margin-bottom: 20px;" /><br>
                    <button type="submit" style="padding: 10px 20px; font-size: 16px; background-color: green; color: white; border: none; border-radius: 5px; cursor: pointer;">Upload & Calculate</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 3. फाइल अपलोड और कैलकुलेशन
app.post('/upload', upload.single('document'), async (req, res) => {
    let filePath = "";
    try {
        if (!req.file) return res.status(400).send("No file uploaded.");

        const printerId = req.query.id;
        const activePrinter = printers[printerId] || printers["PRINTER_01"];
        filePath = path.join(__dirname, 'uploads', req.file.filename);
        
        let totalPages = 1;
        let totalCost = 0;
        let fileType = req.file.mimetype;

        if (fileType === 'application/pdf') {
            const dataBuffer = new Uint8Array(fs.readFileSync(filePath));
            const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
            const pdf = await loadingTask.promise;
            totalPages = pdf.numPages; 
            totalCost = totalPages * activePrinter.pdfPrice;
        } else if (fileType.startsWith('image/')) {
            totalPages = 1;
            totalCost = activePrinter.photoPrice;
            const processedPhotoPath = filePath + '_converted.png';
            await sharp(filePath).resize(2480, 3508, { fit: 'inside' }).toFile(processedPhotoPath);
            fs.unlinkSync(filePath);
            filePath = processedPhotoPath;
            req.file.filename = req.file.filename + '_converted.png';
        }

        const upiString = `upi://pay?pa=yourrealid@upi&pn=SmartPrinter&am=${totalCost}&cu=INR`;
        const qrCodeImage = await QRCode.toDataURL(upiString);

        res.send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 30px; background-color: #f4f4f9;">
                <div style="background: white; max-width: 400px; margin: auto; padding: 30px; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: green;">File Verified! Successfully ✅</h2>
                    <p style="font-size: 18px;">Total Amount: <span style="color: green;"><b>₹${totalCost}</b></span></p>
                    <hr style="margin: 20px 0; border: 0; border-top: 1px solid #ccc;">
                    
                    <h3>Scan QR to Pay 📱</h3>
                    <img src="${qrCodeImage}" alt="QR" style="width: 180px; height: 180px; margin: 10px 0;" />
                    
                    <br><br>
                    <form action="/trigger-print" method="POST">
                        <input type="hidden" name="fileName" value="${req.file.filename}" />
                        <input type="hidden" name="printerId" value="${printerId}" />
                        <input type="hidden" name="format" value="${fileType}" />
                        <input type="hidden" name="cost" value="${totalCost}" />
                        <button type="submit" style="padding: 15px 25px; font-size: 16px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%;">Pay & Print Now 🚀</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error(err);
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).send("Error processing file.");
    }
});

// 4. प्रिंट कमांड एंड लाइव अलर्ट ब्रॉडकास्ट
app.use(express.urlencoded({ extended: true }));
app.post('/trigger-print', async (req, res) => {
    const { fileName, printerId, format, cost } = req.body;
    const filePath = path.join(__dirname, 'uploads', fileName);
    const activePrinter = printers[printerId] || printers["PRINTER_01"];

    if (!fs.existsSync(filePath)) return res.send("Error: File not found.");

    try {
        // 🚨 लाइव डैशबोर्ड को अलर्ट भेजना (WebSocket Magic)
        io.emit('new-print-job', {
            printerName: activePrinter.name,
            format: format.includes('pdf') ? 'PDF' : 'IMAGE',
            cost: cost
        });

        console.log("Sending file to Printer...");
        await ptp.print(filePath); 
        fs.unlinkSync(filePath);

        res.send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px; background-color: #f4f4f9;">
                <div style="background: white; max-width: 400px; margin: auto; padding: 30px; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0,0,0,0.1);">
                    <h1 style="color: green;">Printing Started! 🖨️🚀</h1>
                    <p style="font-size: 18px;">दुकानदार के कंप्यूटर पर लाइव अलर्ट भेज दिया गया है और प्रिंटर चालू हो गया है।</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Printing failed.");
    }
});

// io.on connection setup
io.on('connection', (socket) => { console.log('👤 Dashboard Connected Logged!'); });

// server.listen (app.listen की जगह)
server.listen(3000, () => { console.log('🚀 Server running on port 3000'); });
