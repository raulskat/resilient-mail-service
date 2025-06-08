import express, { Request, Response, RequestHandler } from 'express';
import { EmailService } from './services/EmailService';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const port = process.env.PORT || 3000;
const emailService = new EmailService(io);

app.use(express.json());

// Serve the demo interface directly
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Email Service Demo</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body class="bg-gray-100 p-8">
    <div class="max-w-2xl mx-auto">
        <h1 class="text-2xl font-bold mb-4">Email Service Demo</h1>
        
        <!-- Email Form -->
        <div class="bg-white p-6 rounded-lg shadow mb-6">
            <form id="emailForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1">Test Type:</label>
                    <select id="testType" class="w-full p-2 border rounded">
                        <option value="normal">Normal Delivery</option>
                        <option value="failover">Provider Failover</option>
                        <option value="retry">Retry System</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Email ID:</label>
                    <input type="text" id="emailId" value="test-123" class="w-full p-2 border rounded">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">To:</label>
                    <input type="email" id="to" value="user@example.com" class="w-full p-2 border rounded">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Subject:</label>
                    <input type="text" id="subject" value="Test Email" class="w-full p-2 border rounded">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Message:</label>
                    <textarea id="body" class="w-full p-2 border rounded">This is a test email.</textarea>
                </div>
                <button type="submit" class="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600">
                    Send Email
                </button>
            </form>
        </div>

        <!-- Status Updates -->
        <div class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-xl font-semibold mb-4">Status Updates</h2>
            <div id="updates" class="space-y-2 h-60 overflow-y-auto"></div>
        </div>
    </div>

    <script>
        const socket = io();
        const updates = document.getElementById('updates');
        const emailForm = document.getElementById('emailForm');
        const testType = document.getElementById('testType');
        const emailId = document.getElementById('emailId');

        // Update email ID based on test type
        testType.addEventListener('change', () => {
            emailId.value = testType.value + '-test-' + Date.now();
        });

        // Handle form submission
        emailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                id: emailId.value,
                to: document.getElementById('to').value,
                subject: document.getElementById('subject').value,
                body: document.getElementById('body').value
            };

            try {
                const response = await fetch('/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                
                addUpdate('Email queued: ' + data.id);
                socket.emit('subscribe', data.id);
                
            } catch (error) {
                addUpdate('Error: ' + error.message, true);
            }
        });

        // Handle WebSocket updates
        socket.on('connect', () => addUpdate('Connected to server'));
        socket.on('disconnect', () => addUpdate('Disconnected from server', true));
        socket.on('status_update', (data) => addUpdate(data.id + ': ' + data.status));

        // Helper to add updates to the UI
        function addUpdate(message, isError = false) {
            const div = document.createElement('div');
            div.className = 'p-2 rounded ' + (isError ? 'bg-red-100' : 'bg-gray-100');
            div.textContent = new Date().toLocaleTimeString() + ' - ' + message;
            updates.insertBefore(div, updates.firstChild);
        }
    </script>
</body>
</html>
  `);
});

app.post('/send-email', (async (req: Request, res: Response) => {
  const { id, to, subject, body } = req.body;
  if (!id || !to || !subject || !body) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const result = await emailService.sendEmail(id, to, subject, body);
  res.json({ 
    result,
    message: "You will be notified when the email is sent. Connect to the WebSocket for real-time updates."
  });
}) as RequestHandler);

app.get('/status/:id', ((req: Request, res: Response) => {
  const status = emailService.getStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'Not found' });
  res.json({ status });
}) as RequestHandler);

io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('subscribe', (emailId) => {
    console.log(`Client subscribed to updates for email ${emailId}`);
    socket.join(emailId);
    
    const currentStatus = emailService.getStatus(emailId);
    if (currentStatus) {
      socket.emit('status_update', { id: emailId, status: currentStatus });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

httpServer.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
