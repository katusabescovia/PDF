import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Eye } from 'lucide-react';
import { getDocument } from 'pdfjs-dist';
import axios from 'axios';

function Home() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    const examLink = localStorage.getItem('currentExamFullLink');
    console.log('ExamLink:', examLink);
    if (examLink) {
      const match = examLink.match(/ExamNo=(\d+)/);
      if (match && match[1]) {
        setRoomId(match[1]);
      }
    }
  }, []);

  const handleJoinAsStreamer = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/exam/${roomId.trim()}`);
    }
  };

  const handleJoinAsViewer = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/view/${roomId.trim()}`);
    }
  };

  const extractExamNoFromPDF = async (pdfUrl: string): Promise<string | null> => {
    try {
      // Fetch PDF text via backend to avoid CORS issues
      const response = await axios.post('http://localhost:3001/pdf', { pdfUrl });
      if (response.status !== 200 || !response.data.text) {
        throw new Error('Failed to fetch or parse PDF');
      }

      const text = response.data.text;
      const match = text.match(/ExamNo=(\d+)/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('Error extracting ExamNo from PDF:', error);
      setPdfError('Failed to extract ExamNo from the PDF. Please try again.');
      return null;
    }
  };

  const handlePDFClick = async () => {
    const examLink = localStorage.getItem('currentExamFullLink');
    if (!examLink) {
      setPdfError('No exam link found in localStorage.');
      return;
    }

    const examNo = await extractExamNoFromPDF(examLink);
    if (examNo) {
      setRoomId(examNo);
      navigate(`/exam/${examNo}`);
    } else {
      setPdfError('Failed to extract ExamNo from the PDF.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6">
      <div className="bg-[#10211f] rounded-xl shadow-md p-8">
        <h1 className="text-3xl font-bold text-[#edf2f7] mb-6 text-center">
          Welcome to ProctorStream
        </h1>

        <div className="mb-8">
          <p className="text-[#a0aec0] text-center">
            Enter a room ID or load an exam from a PDF to start a proctoring session
          </p>
        </div>

        {pdfError && (
          <div className="text-red-500 text-center mb-4">{pdfError}</div>
        )}

        <form className="space-y-6 mt-6">
          <div>
            <label
              htmlFor="roomId"
              className="block text-sm font-medium text-[#a0aec0] mb-1"
            >
              Room ID
            </label>
            <input
              type="text"
              id="roomId"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="mt-1 block w-full rounded-md bg-[#3d5754] border border-[#2d3748] text-[#edf2f7] p-2 focus:border-[#4fddc8] focus:outline-none focus:ring-2 focus:ring-[#4fddc8]"
              placeholder="Enter room ID"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <button
              onClick={handleJoinAsStreamer}
              className="flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium text-white bg-[#6366f1] hover:bg-[#4c51bf]"
            >
              <Camera className="h-5 w-5 mr-2" />
              Join as Streamer
            </button>

            <button
              onClick={handleJoinAsViewer}
              className="flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium text-white bg-[#48bb78] hover:bg-[#38a169]"
            >
              <Eye className="h-5 w-5 mr-2" />
              Join as Viewer
            </button>

            <button
              onClick={handlePDFClick}
              className="flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium text-white bg-[#e53e3e] hover:bg-[#c53030]"
            >
              Load Exam from PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Home;