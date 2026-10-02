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
    "PRINTER_01": { name: "Central Library LaserJet", location: "Block A, 1st Floor", pdfPrice: 5, photoPrice: 10 },
    "PRINTER_02": { name: "Tech Lab Color Printer", location: "Lab 3, Ground Floor", pdfPrice: 8, photoPrice: 15 },
    "PRINTER_03": { name: "Canteen Kiosk Printer", location: "Cafeteria Zone", pdfPrice: 5, photoPrice: 10 }
};

// 1. दुकानदार का लाइव डैशबोर्ड
app.get('/dashboard', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Merchant Live Monitor</title>
            <script src="/socket.io/socket.io.js"></script>
            <script src="https://tailwindcss.com"></script>
        </head>
        <body class="bg-slate-900 text-slate-100 min-h-screen p-8">
            <div class="max-w-4xl mx-auto">
                <div class="flex items-center justify-between border-b border-slate-800 pb-5 mb-8">
                    <div>
                        <h1 class="text-3xl font-extrabold text-blue-400">🖨️ Instaprint Monitor</h1>
                        <p class="text-slate-400 text-sm>Real-time Print Queue</p>
                    </div>
                </div>
                <div class="bg-slate-800/40 p-6 rounded-2xl border border-slate-700">
                    <ul id="print-list" class="space-y-3">
                        <li id="no-jobs" class="text-slate-500 text-center py-12 italic">Waiting for kiosk scans...</li>
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
                    item.className = "bg-slate-800 p-5 rounded-xl flex justify-between border-l-4 border-l-emerald-500";
                    item.innerHTML = '<div><b>' + data.printerName + '</b><p>' + data.format + '</p></div><div>₹' + data.cost + '</div>';
                    list.prepend(item);
                });
            </script>
        </body>
        </html>
    `);
});
// 2. यूजर का मोबाइल अपलोड पेज
app.get('/print', (req, res) => {
    const printerId = req.query.id || "PRINTER_01"; 
    const activePrinter = printers[printerId] || printers["PRINTER_01"];

    res.send(`
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Instaprint Kiosk</title>
            <script src="https://tailwindcss.com"></script>
        </head>
        <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4">
            <div class="w-full max-w-md bg-white rounded-3xl shadow-xl border p-6">
                <h2 class="text-2xl font-extrabold text-center mb-4">Instaprint Kiosk</h2>
                <form action="/upload?id=${printerId}" method="POST" enctype="multipart/form-data" class="space-y-4">
                    <input type="file" name="document" accept="application/pdf, image/*" required class="w-full border p-3 rounded-xl" />
                    <button type="submit" class="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl">Process Document</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 3. यूजर का पेमेंट पेज (यहाँ असली Razorpay का पॉप-अप खुलेगा)
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
            totalCost = activePrinter.photoPrice;
            const processedPhotoPath = filePath + '_converted.png';
            await sharp(filePath).resize(2480, 3508, { fit: 'inside' }).toFile(processedPhotoPath);
            fs.unlinkSync(filePath);
            filePath = processedPhotoPath;
            req.file.filename = req.file.filename + '_converted.png';
        }

        const amountInPaise = totalCost * 100;

        res.send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Secure Checkout</title>
                <script src="https://tailwindcss.com"></script>
                <script src="https://razorpay.com"></script>
            </head>
            <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4">
                <div class="w-full max-w-md bg-white rounded-3xl shadow-xl p-6 text-center">
                    <h2 class="text-xl font-extrabold mb-4">Checkout Invoice</h2>
                    <p class="text-emerald-500 font-black text-2xl mb-6">Total: ₹${totalCost}</p>
                    <button id="rzp-button" class="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl">Pay with Razorpay 💳</button>
                </div>
                <script>
                    var options = {
                        "key": "${RAZORPAY_KEY_ID}",
                        "amount": "${amountInPaise}",
                        "currency": "INR",
                        "name": "Smart Kiosk Network",
                        "handler": function (response){
                            var form = document.createElement('form');
                            form.method = 'POST';
                            form.action = '/trigger-print';
                            var inputs = {
                                'fileName': '${req.file.filename}', 'printerId': '${printerId}',
                                'format': '${fileType}', 'cost': '${totalCost}'
                            };
                            for (var key in inputs) {
                                var input = document.createElement('input');
                                input.type = 'hidden'; input.name = key; input.value = inputs[key];
                                form.appendChild(input);
                            }
                            document.body.appendChild(form);
                            form.submit();
                        }
                    };
                    var rzp1 = new window.Razorpay(options);
                    document.getElementById('rzp-button').onclick = function(e){
                        rzp1.open(); e.preventDefault();
                    }
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).send("Error compiling checkout.");
    }
});

// 4. प्रिंट और डैशबोर्ड लाइव अलर्ट एंडपॉइंट
app.use(express.urlencoded({ extended: true }));
app.post('/trigger-print', async (req, res) => {
    const { fileName, printerId, format, cost } = req.body;
    const filePath = path.join(__dirname, 'uploads', fileName);
    const activePrinter = printers[printerId] || printers["PRINTER_01"];

    if (!fs.existsSync(filePath)) return res.send("Error: Session Expired.");

    try {
        io.emit('new-print-job', {
            printerName: activePrinter.name,
            format: format.includes('pdf') ? 'PDF' : 'IMAGE',
            cost: cost
        });

        await ptp.print(filePath); 
        fs.unlinkSync(filePath);

        res.send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: green;">Printing Started! 🖨️🚀</h1>
                <p>Payment verified by Razorpay. Please collect your sheets.</p>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Printing failed.");
    }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { console.log('🚀 Server running on port ' + PORT); });
