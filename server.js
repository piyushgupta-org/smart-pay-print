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

const printers = {
    "PRINTER_01": { name: "Library LaserJet", location: "First Floor", pdfPrice: 5, photoPrice: 10 },
    "PRINTER_02": { name: "Lab Color Printer", location: "Ground Floor", pdfPrice: 8, photoPrice: 15 },
    "PRINTER_03": { name: "Canteen Area Printer", location: "Canteen", pdfPrice: 5, photoPrice: 10 }
};

// 1. दुकानदार का लाइव सिंपल डैशबोर्ड
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
                    item.style.borderRadius = '5px'; item.style.borderLeft = '5px solid #28a745';
                    item.style.display = 'flex'; item.style.justifyContent = 'space-between';
                    item.innerHTML = '<div><b>' + data.printerName + '</b> (' + data.format + ')</div><div><span style="color: green; font-weight: bold;">Paid</span> <b>₹' + data.cost + '</b></div>';
                    list.prepend(item);
                    const audio = new AudioContext(); const osc = audio.createOscillator();
                    osc.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.1);
                });
            </script>
        </body>
        </html>
    `);
});
// 2. यूजर का होम पेज (Smart Pay-Per-Print Hub)
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

// 3. यूजर का पेमेंट पेज (इन-बिल्ट सिमुलेटर इंजन)
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
        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Secure Payment</title>
                <script src="https://tailwindcss.com"></script>
            </head>
            <body style="font-family: Arial; text-align: center; padding: 20px; background-color: #f4f4f9;" class="flex items-center justify-center min-h-screen">
                <div style="background: white; max-width: 400px; width: 100%; margin: auto; padding: 30px; border-radius: 15px; box-shadow: 0px 0px 15px rgba(0,0,0,0.1);">
                    <h2 style="color: green; font-weight: bold; font-size: 22px;">Calculation Success! ✅</h2>
                    <div class="text-left bg-slate-50 p-4 rounded-xl my-4 text-sm space-y-1 border">
                        <p>Format: <b>${displayType}</b></p>
                        <p>Total Items: <b>${totalPages}</b></p>
                        <p class="text-base text-emerald-600 font-bold">Total Amount: <b>₹${totalCost}</b></p>
                    </div>
                    <hr class="my-4">
                    <button id="rzp-button" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md text-sm transition tracking-wide">
                        Pay with Razorpay 💳
                    </button>
                    <br><br><a href="/print?id=${printerId}" style="color: red; text-decoration: none;" class="text-sm">Cancel Order</a>
                </div>

                <!-- इन-बिल्ट मर्चेंट टेस्ट ओवरले -->
                <div id="payment-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
                    <div class="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100">
                        <div class="bg-blue-600 p-5 text-white text-center">
                            <h3 class="font-extrabold text-lg">Razorpay Secure Checkout</h3>
                            <p class="text-xs text-blue-100 mt-0.5">Test Mode Environment</p>
                        </div>
                        <div class="p-5 text-center">
                            <p class="text-xs text-slate-400 uppercase tracking-wider font-bold">Amount to Pay</p>
                            <p class="text-3xl font-black text-slate-800 my-2">₹${totalCost}</p>
                            <div class="bg-slate-50 border p-4 rounded-xl text-left my-4 space-y-3">
                                <label class="flex items-center gap-3 p-1"><input type="radio" checked class="w-4 h-4 text-blue-600"><span class="text-sm font-medium text-slate-700">📱 UPI (Google Pay / PhonePe)</span></label>
                            </div>
                            <button id="confirm-pay" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl text-sm shadow-md">Simulate Success Payment ✓</button>
                            <button id="close-modal" class="w-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-bold py-2.5 rounded-xl text-xs mt-2">Close</button>
                        </div>
                    </div>
                </div>

                <script>
                    document.getElementById('rzp-button').onclick = function() { document.getElementById('payment-modal').style.display = 'flex'; };
                    document.getElementById('close-modal').onclick = function() { document.getElementById('payment-modal').style.display = 'none'; };
                    document.getElementById('confirm-pay').onclick = function() {
                        var form = document.createElement('form'); form.method = 'POST'; form.action = '/trigger-print';
                        var inputs = { 'fileName': '${req.file.filename}', 'printerId': '${printerId}', 'format': '${fileType}', 'cost': '${totalCost}' };
                        for (var key in inputs) {
                            var input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = inputs[key];
                            form.appendChild(input);
                        }
                        document.body.appendChild(form); form.submit();
                    };
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).send("Error compiling invoice.");
    }
});

// 4. प्रिंटर एक्शन और लाइव अलर्ट ट्रिगर
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
                    <p style="font-size: 18px;">Payment verified by Razorpay Simulation. Please collect sheets.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) { res.status(500).send("Printing failed."); }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { console.log('🚀 Server running on port ' + PORT); });
