import React, { Suspense, useEffect, useState, useCallback, createContext } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Camera, AlertCircle } from 'lucide-react';
import { socket } from './config/socket';
import ProctoringPage from './components/ProctoringPage';
import ExamInterface from './components/ExamInterface '; 
import ExamPage from './components/ExamPage'; 
import StudentLogin from './pages/Login';



const Home = React.lazy(() => import('./components/Home'))
const Viewer = React.lazy(() => import('./components/Viewer'));

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-4xl mx-auto mt-10 p-6">
          <div className="bg-red-900/20 rounded-lg shadow-xl p-6 border border-red-500">
            <div className="flex items-center text-red-500 mb-4">
              <AlertCircle className="h-6 w-6 mr-2" />
              <h2 className="text-xl font-semibold">Something went wrong</h2>
            </div>
            <p className="text-red-200 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Link
              to="/"
              className="text-white bg-red-500 hover:bg-red-600 px-4 py-2 rounded"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Return Home
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const LoadingScreen = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
  </div>
);

export const SocketContext = createContext<{
  isConnected: boolean;
  reconnect: () => void;
}>({
  isConnected: false,
  reconnect: () => {},
});

function App() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const handleConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const reconnect = useCallback(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  return (
      <SocketContext.Provider value=
      {{ isConnected, reconnect }}>
      <BrowserRouter>
        {/* <ErrorBoundary>
          <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
            <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                  <Link to="/" className="flex items-center">
                    <Camera className="h-8 w-8 text-indigo-500" />
                    <span className="ml-2 text-xl font-bold text-white">ProctorStream</span>
                  </Link>
        <div className="flex items-center space-x-4">
                    <span
                     className={`px-3 py-1 rounded-full text-sm ${
                        isConnected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      }`}
                    >
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>
            </nav> */}
            <ErrorBoundary>
      {/* <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800"> */}
      <div className="min-h-screen bg-[linear-gradient(to_bottom_right,_#0b1e1b,_#496863)]">
        <nav className="bg-[#2c484380] backdrop-blur-md sticky top-0 z-50 shadow-md">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex items-center justify-between h-16">
      <Link to="/" className="flex items-center text-[#edf2f7] font-bold text-xl">
        <Camera className="h-8 w-8 text-[#4c51bf] mr-2" />
        ProctorStream
      </Link>
      <div className="flex items-center space-x-4">
        <span
          className={`px-4 py-2 rounded-full text-sm font-medium ${
            isConnected ? 'bg-[#48bb78] text-white' : 'bg-[#f56565] text-white'
          }`}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  </div>
</nav>


            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/home" element={<Home />} />
                <Route
                  path="/exam/:examNo"
                  element={
                    <ErrorBoundary>
                      <ExamPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/view/:roomId"
                  element={
                    <ErrorBoundary>
                      <Viewer />
                    </ErrorBoundary>
                  }
                />
                <Route path="/proctoring" element={<ProctoringPage />} />
                <Route path="/student-login" element={<StudentLogin />} />
               
        <Route path="/" element={<ExamInterface />} />
            {/* <Route path="/exam" element={<ExamPage />} /> */}
              </Routes>
            </Suspense>
          </div>
        </ErrorBoundary>
      </BrowserRouter>
    </SocketContext.Provider>
  );
}

export default App;




