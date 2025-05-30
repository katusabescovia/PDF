
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { joinRoom, leaveRoom, onStream } from '../config/socket';
import { Monitor, ScrollText } from 'lucide-react';

interface StreamData {
  id: string;
  data: string;
}

function Viewer() {
  const { roomId } = useParams();
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fitAll, setFitAll] = useState(true); // Toggle mode

  useEffect(() => {
    if (!roomId) {
      setError('Room ID is required');
      return;
    }

    joinRoom(roomId);

    onStream((data: string) => {
      setStreams((prev) => {
        const id = data.substring(0, 10); // Dummy unique ID based on data
        const exists = prev.find((stream) => stream.id === id);
        if (exists) {
          return prev.map((stream) => (stream.id === id ? { ...stream, data } : stream));
        }
        return [...prev, { id, data }];
      });
    });

    return () => {
      leaveRoom();
    };
  }, [roomId]);

  const toggleLayout = () => setFitAll((prev) => !prev);

  return (
    <div className="p-6 text-white bg-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-[#106053]">Live Viewer Dashboard</h1>
        <button
          onClick={toggleLayout}
          className="bg-[#106053] hover:bg-[#004d47] text-white px-4 py-2 rounded flex items-center gap-2"
        >
          {fitAll ? <ScrollText size={18} /> : <Monitor size={18} />}
          {fitAll ? 'Scroll Mode' : 'Fit All Mode'}
        </button>
      </div>

      <div
        className={`grid gap-4 ${
          fitAll
            ? 'auto-fit-grid'
            : 'scroll-grid max-h-[80vh] overflow-y-auto'
        }`}
        style={{
          gridTemplateColumns: fitAll
            ? 'repeat(auto-fit, minmax(150px, 1fr))'
            : 'repeat(auto-fill, 160px)',
        }}
      >
        {streams.map((stream) => (
          <div
            key={stream.id}
            className="relative w-full"
            style={{ paddingTop: '100%' }}
          >
            <img
              src={stream.data}
              alt="Live Stream"
              className="absolute inset-0 w-full h-full object-cover rounded-md border border-gray-700"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Viewer;

