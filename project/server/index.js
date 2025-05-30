import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import PDFParser from 'pdf2json';
import cors from 'cors';

// Initialize Express app
const app = express();
app.use(express.json());

// Enable CORS for the frontend origin
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

// Create HTTP server and integrate with Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
    transports: ['websocket', 'polling'],
  },
});

// Socket.IO room management
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    try {
      socket.join(roomId);
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { viewers: new Set(), streamer: null });
      }
      const room = rooms.get(roomId);

      const isStreamer = socket.handshake.headers.referer?.includes('/stream/');
      if (isStreamer) {
        room.streamer = socket.id;
      } else {
        room.viewers.add(socket.id);
      }

      io.to(roomId).emit('room-update', {
        viewerCount: room.viewers.size,
        hasStreamer: !!room.streamer,
      });
    } catch (error) {
      console.error('Error in join-room:', error);
    }
  });

  socket.on('stream-video', (data) => {
    try {
      const roomId = Array.from(socket.rooms)[1];
      if (roomId) {
        console.log(`Broadcasting stream to room ${roomId}. Data size: ${data.length}`);
        socket.to(roomId).emit('receive-stream', data);
      }
    } catch (error) {
      console.error('Error in stream-video:', error);
    }
  });

  socket.on('leave-room', () => {
    try {
      const roomId = Array.from(socket.rooms)[1];
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          if (room.streamer === socket.id) {
            room.streamer = null;
          } else {
            room.viewers.delete(socket.id);
          }
          io.to(roomId).emit('room-update', {
            viewerCount: room.viewers.size,
            hasStreamer: !!room.streamer,
          });
        }
      }
    } catch (error) {
      console.error('Error in leave-room:', error);
    }
  });

  socket.on('disconnect', () => {
    try {
      rooms.forEach((room, roomId) => {
        if (room.streamer === socket.id) {
          room.streamer = null;
        } else {
          room.viewers.delete(socket.id);
        }
        io.to(roomId).emit('room-update', {
          viewerCount: room.viewers.size,
          hasStreamer: !!room.streamer,
        });
      });
      console.log('User disconnected:', socket.id);
    } catch (error) {
      console.error('Error in disconnect:', error);
    }
  });
});

// PDF parsing endpoint




// app.post('/pdf', async (req, res) => {
//   const { pdfUrl } = req.body;
//   console.log('Received PDF URL:', pdfUrl);

//   if (!pdfUrl) {
//     console.error('No PDF URL provided');
//     return res.status(400).json({ error: 'No PDF URL provided' });
//   }

//   if (!pdfUrl.match(/^https?:\/\//)) {
//     console.error('Invalid PDF URL:', pdfUrl);
//     return res.status(400).json({ error: 'Invalid PDF URL' });
//   }

//   try {
//     console.log('Fetching PDF from:', pdfUrl);
//     const response = await axios.get(pdfUrl, {
//       responseType: 'arraybuffer',
//       timeout: 15000,
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
//       },
//     });
//     console.log('PDF fetched, size:', response.data.length, 'bytes');

//     const pdfParser = new PDFParser();

//     pdfParser.on('pdfParser_dataError', (errData) => {
//       console.error('Error parsing PDF:', errData.parserError);
//       res.status(500).json({
//         error: 'Failed to parse PDF',
//         details: errData.parserError,
//       });
//     });

//     pdfParser.on('pdfParser_dataReady', (pdfData) => {
//       try {
//         const lines = [];
//         pdfData.Pages.forEach((page) => {
//           const pageLines = page.Texts.map((text) => {
//             try {
//               // Decode and clean text
//               let decoded = decodeURIComponent(text.R[0].T).trim();
//               // Remove extra spaces and control characters
//               decoded = decoded.replace(/\s+/g, ' ').replace(/[\x00-\x1F\x7F]/g, '');
//               return decoded;
//             } catch (e) {
//               console.warn('Failed to decode text:', text.R[0].T);
//               return text.R[0].T.trim();
//             }
//           }).filter((line) => line && line.length > 1); // Filter out empty or single-character lines
//           lines.push(...pageLines);
//         });

//         console.log('Parsed PDF lines (first 20):', lines.slice(0, 20));
//         res.json({ lines });
//       } catch (error) {
//         console.error('Error processing parsed PDF data:', error.message);
//         res.status(500).json({
//           error: 'Failed to process parsed PDF data',
//           details: error.message,
//         });
//       }
//     });

//     pdfParser.parseBuffer(response.data);
//   } catch (error) {
//     console.error('Error fetching PDF:', error.message, error.response?.status || '');
//     res.status(500).json({
//       error: 'Failed to fetch PDF',
//       details: error.response
//         ? `Server responded with status ${error.response.status}: ${error.message}`
//         : error.request
//         ? 'No response received'
//         : error.message,
//       status: error.response?.status,
//     });
//   }
// });

app.post('/pdf', async (req, res) => {
  const { pdfUrl } = req.body;
  console.log('Received PDF URL:', pdfUrl);

  if (!pdfUrl) {
    console.error('No PDF URL provided');
    return res.status(400).json({ error: 'No PDF URL provided' });
  }

  if (!pdfUrl.match(/^https?:\/\//)) {
    console.error('Invalid PDF URL:', pdfUrl);
    return res.status(400).json({ error: 'Invalid PDF URL' });
  }

  try {
    console.log('Fetching PDF from:', pdfUrl);
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    console.log('PDF fetched, size:', response.data.length, 'bytes');

    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataError', (errData) => {
      console.error('Error parsing PDF:', errData.parserError);
      res.status(500).json({
        error: 'Failed to parse PDF',
        details: errData.parserError,
      });
    });

    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      try {
        const sentences = [];
        let currentSentence = [];
        let lastY = null;
        const yThreshold = 5; // Adjust based on PDF line spacing (in PDF units)
        const sentenceEndings = /[.!?]$/;

        pdfData.Pages.forEach((page, pageIndex) => {
          // Sort texts by y-coordinate (top to bottom), then x-coordinate (left to right)
          const texts = page.Texts.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) > yThreshold) return yDiff; // Different lines
            return a.x - b.x; // Same line, sort by x
          });

          texts.forEach((text, index) => {
            try {
              // Decode and clean text
              let decoded = decodeURIComponent(text.R[0].T).trim();
              decoded = decoded.replace(/\s+/g, ' ').replace(/[\x00-\x1F\x7F]/g, '');
              if (!decoded || decoded.length <= 1) return; // Skip empty or single-character lines

              // Check if text is on a new line based on y-coordinate
              const isNewLine = lastY !== null && Math.abs(text.y - lastY) > yThreshold;

              // Add text to current sentence
              currentSentence.push(decoded);

              // Check if the text ends with sentence-ending punctuation
              const isSentenceEnd = sentenceEndings.test(decoded);

              // If it's a sentence end or a new line, finalize the current sentence
              if (isSentenceEnd || isNewLine || index === texts.length - 1) {
                if (currentSentence.length > 0) {
                  const sentence = currentSentence.join(' ').trim();
                  if (sentence.length > 1) {
                    sentences.push(sentence);
                  }
                  currentSentence = isSentenceEnd ? [] : [decoded]; // Start new sentence if ended
                }
              }

              lastY = text.y; // Update last y-coordinate
            } catch (e) {
              console.warn('Failed to decode text:', text.R[0].T);
              // Fallback: add raw text if decoding fails
              const rawText = text.R[0].T.trim();
              if (rawText.length > 1) {
                currentSentence.push(rawText);
              }
            }
          });

          // Finalize any remaining sentence for the page
          if (currentSentence.length > 0) {
            const sentence = currentSentence.join(' ').trim();
            if (sentence.length > 1) {
              sentences.push(sentence);
            }
            currentSentence = [];
            lastY = null; // Reset for next page
          }
        });

        console.log('Parsed PDF sentences (first 20):', sentences.slice(0, 20));
        res.json({ sentences });
      } catch (error) {
        console.error('Error processing parsed PDF data:', error.message);
        res.status(500).json({
          error: 'Failed to process parsed PDF data',
          details: error.message,
        });
      }
    });

    pdfParser.parseBuffer(response.data);
  } catch (error) {
    console.error('Error fetching PDF:', error.message, error.response?.status || '');
    res.status(500).json({
      error: 'Failed to fetch PDF',
      details: error.response
        ? `Server responded with status ${error.response.status}: ${error.message}`
        : error.request
        ? 'No response received'
        : error.message,
      status: error.response?.status,
    });
  }
});




const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});