import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './Exam.module.css';
import * as faceapi from 'face-api.js';
import { emitStream, joinRoom, leaveRoom } from '../config/socket';
import axios from 'axios';

// Type definitions
type Timer = {
  hours: number;
  minutes: number;
  seconds: number;
};

type SecurityChecks = {
  fullscreen: boolean;
  safeBrowser: boolean;
  noScreenCapture: boolean;
  noCopyPaste: boolean;
  noDevTools: boolean;
  noPrintScreen: boolean;
  noMultipleWindows: boolean;
};

type Violation = {
  type: string;
  timestamp: string;
};

type Question = {
  id: string;
  text: string;
  type: 'multiple-choice' | 'short-answer' | 'essay';
  options?: string[];
};

type Section = {
  title: string;
  description: string;
  questions: Question[];
};

type ExamData = {
  instructions: {
    title: string;
    content: string[];
  };
  sections: {
    [key: string]: Section;
  };
};

const ExamPage: React.FC = () => {
  const [showInstructions, setShowInstructions] = useState<boolean>(true);
  const [currentSection, setCurrentSection] = useState<string>('instructions');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timer, setTimer] = useState<Timer>({
    hours: 3,
    minutes: 0,
    seconds: 0
  });
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  // const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  // const [fullscreenAttempts, setFullscreenAttempts] = useState<number>(0);
  const [screenCaptureAttempts, setScreenCaptureAttempts] = useState<number>(0);
  const [securityChecks, setSecurityChecks] = useState<SecurityChecks>({
    fullscreen: false,
    safeBrowser: false,
    noScreenCapture: false,
    noCopyPaste: true,
    noDevTools: false,
    noPrintScreen: false,
    noMultipleWindows: false
  });
  const [isReady, setIsReady] = useState<boolean>(false);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceDetectionError, setFaceDetectionError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const faceDetectionInterval = useRef<NodeJS.Timeout | null>(null);
  const fullscreenCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const fullscreenLockInterval = useRef<NodeJS.Timeout | null>(null);
  const securityCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const devToolsCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const frameInterval = useRef<NodeJS.Timeout | null>(null);
  const detectionBufferRef = useRef<number[]>([]); // 0 = no face, 1 = one face, 2 = multiple faces
  const navigate = useNavigate();
  const { roomId, examNo: ExamNo } = useParams();

  const [smoothedDetection, setSmoothedDetection] = useState<0 | 1 | 2>(1); // default to 1 (one face)
  const [noFaceTimer, setNoFaceTimer] = useState(0);
  const [multiFaceTimer, setMultiFaceTimer] = useState(0);

  const [examData, setExamData] = useState<ExamData | null>(null);
  const [loadingExam, setLoadingExam] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Utility to check if browser is supported (Chrome, Edge, Safari)
  const isSupportedBrowser = () => {
    const ua = window.navigator.userAgent;
    return (
      /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua) // Chrome (not Edge or Opera)
      || /Edg\//.test(ua) // Edge
      || /Safari\//.test(ua) && !/Chrome\//.test(ua) // Safari (not Chrome)
    );
  };

  // Fetch exam data from API (simulate with a timeout or replace with real fetch)
  useEffect(() => {
    const fetchExam = async () => {
      setLoadingExam(true);
      setFetchError(null);
      try {
        // Replace this with your real API call
        // const response = await fetch('/api/exam');
        // const data = await response.json();
        // setExamData(data);
        // Simulate API: supports both essay-only and mixed papers
        const simulatedExam: ExamData = {
          instructions: {
            title: "INSTITUTE OF ALLIED HEALTH SCIENCES (IAHS)",
            content: [
              "BML 2102-D: Medical Microbiology I",
              "Academic Year: 2023/2024",
              "Exam Date: Wednesday 13th December, 2023",
              "Time Allowed: 03:00 hours [12:00 AM - 12:00 AM]",
              "Student Registration Number: ________________________________",
              "",
              "INSTRUCTIONS TO CANDIDATES",
              "1. This exam may contain multiple choice, short answer, or essay questions.",
              "2. Answer all questions as instructed in each section.",
              "3. EXAM MALPRACTICE will lead to TOTAL DISQUALIFICATION."
            ]
          },
          sections: {
            A: {
              title: "Section A",
              description: "Multiple Choice Questions",
              questions: [
                { id: "A1", text: "What is the capital city of Uganda?", options: ["Kampala", "Nairobi", "Kigali", "Dodoma"], type: "multiple-choice" },
                { id: "A2", text: "Which of the following is NOT a programming language?", options: ["Python", "JavaScript", "HTML", "Java"], type: "multiple-choice" }
              ]
            },
            B: {
              title: "Section B",
              description: "Essay Questions",
              questions: [
                { id: "B1", text: "Discuss the impact of AI on healthcare.", type: "essay" },
                { id: "B2", text: "Explain the importance of data security.", type: "essay" }
              ]
            },
            C: {
              title: "Section C",
              description: "Short Answer Questions",
              questions: [
                { id: "C1", text: "Define qualitative research.", type: "short-answer" },
                { id: "C2", text: "List two ethical principles in research.", type: "short-answer" }
              ]
            }
          }
        };
        setTimeout(() => {
          setExamData(simulatedExam);
          setLoadingExam(false);
        }, 500); // Simulate network delay
      } catch (err) {
        setFetchError('Failed to load exam.');
        setLoadingExam(false);
      }
    };
    fetchExam();
  }, []);

  // Fetch text content based on ExamNo
  useEffect(() => {
    const fetchExamText = async () => {
      if (!ExamNo) return;

      try {
        setLoadingExam(true);
        setFetchError(null);
       let pdfUrl=`https://eadmin.ciu.ac.ug/API/doc_verification.aspx?doc=Exam&ExamNo=${ExamNo}`;
        const response = await axios.post(
        'http://localhost:3001/pdf',
        { pdfUrl },
       
          
      );
        // if (response.status !== 200) {
        //   throw new Error('Failed to fetch exam text');
        // }
         console.log(pdfUrl)
        

        const data = response.data;
        setExamData(data);
        console.log(data)

      } catch (err) {
        setFetchError('Failed to load exam text.');
      } finally {
        setLoadingExam(false);
      }
    };

    fetchExamText();
  }, [ExamNo]);



  useEffect(() => {
    if (examData && Object.keys(examData.sections).length > 0) {
      const firstSectionKey = Object.keys(examData.sections)[0];
      setCurrentSection(firstSectionKey);
      const firstQuestion = examData.sections[firstSectionKey]?.questions?.[0] || null;
      setCurrentQuestion(firstQuestion);
    }
  }, [examData]);

  // Record violations for audit trail
  const recordViolation = (type: string): void => {
    const violation: Violation = {
      type,
      timestamp: new Date().toISOString(),
    };
    console.log("Violation recorded:", violation);
    setViolations(prev => [...prev, violation]);
  };

  // Load face detection model
  useEffect(() => {
    const loadModels = async (): Promise<void> => {
      try {
        await faceapi.nets.tinyFaceDetector.load('/models/tiny_face_detector_model-weights_manifest.json');
        console.log("Face detection model loaded successfully");
        setIsModelLoaded(true);
        setFaceDetectionError(null);
      } catch (error) {
        console.error("Error loading face detection model:", error);
        setFaceDetectionError("Face detection model failed to load. Please refresh the page.");
      }
    };
    loadModels();
  }, []);

  // Detection constants
  const DETECTION_BUFFER_SIZE = 6; // ~3 seconds if interval is 500ms
  const NO_FACE_WARNING_SECONDS = 3; // How long before warning for no face
  const MULTIPLE_FACE_WARNING_SECONDS = 2;

  // Remove buffer for 'no face' warning, use only latest detection for instant feedback
  const detectFaces = async (video: HTMLVideoElement): Promise<void> => {
    try {
      if (!video || !isModelLoaded) return;
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
      );
      let detectionType: 0 | 1 | 2 = 0;
      if (detections.length === 1) detectionType = 1;
      else if (detections.length > 1) detectionType = 2;

      // Only use buffer for multi-face warning
      if (detectionType === 2) {
        detectionBufferRef.current.push(2);
        if (detectionBufferRef.current.length > DETECTION_BUFFER_SIZE) {
          detectionBufferRef.current.shift();
        }
      } else {
        detectionBufferRef.current = [];
      }

      // For instant no-face/one-face feedback, update smoothedDetection immediately
      setSmoothedDetection(detectionType);
    } catch (error) {
      console.error('Face detection error:', error);
      setFaceDetectionError('Face detection failed. Please check your camera.');
    }
  };

  // Timers for warnings (instant for no face, buffered for multi-face)
  useEffect(() => {
    let noFaceInt: NodeJS.Timeout | undefined;
    let multiFaceInt: NodeJS.Timeout | undefined;

    // No face warning: instant reset
    if (smoothedDetection === 0) {
      noFaceInt = setInterval(() => setNoFaceTimer(t => t + 1), 1000);
    } else {
      setNoFaceTimer(0);
    }

    // Multi-face warning: only show if buffer is stable
    const multiFaceBufferStable = detectionBufferRef.current.length === DETECTION_BUFFER_SIZE && detectionBufferRef.current.every(v => v === 2);
    if (multiFaceBufferStable) {
      multiFaceInt = setInterval(() => setMultiFaceTimer(t => t + 1), 1000);
    } else {
      setMultiFaceTimer(0);
    }

    return () => {
      if (noFaceInt) clearInterval(noFaceInt);
      if (multiFaceInt) clearInterval(multiFaceInt);
    };
  }, [smoothedDetection]);

  const showNoFaceWarning = smoothedDetection === 0 && noFaceTimer >= NO_FACE_WARNING_SECONDS;
  const showMultiFaceWarning = detectionBufferRef.current.length === DETECTION_BUFFER_SIZE && detectionBufferRef.current.every(v => v === 2) && multiFaceTimer >= MULTIPLE_FACE_WARNING_SECONDS;
  // Only show 'Face Detected' if exactly one face is detected and NOT when multiple faces are present
  const showFaceDetected = smoothedDetection === 1 && detectionBufferRef.current.length === 0;

  // Enhanced camera initialization
  const initializeCamera = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 640, ideal: 1280 },
          height: { min: 480, ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().then(resolve);
            };
          }
        });
        setCameraActive(true);
        setCameraError(null);
        // Join the room for live streaming
        if (roomId) joinRoom(roomId);
        // Start face detection and frame streaming
        startFrameStreaming();
      }
    } catch (err) {
      console.error("Camera initialization error:", err);
      setCameraError("Camera access denied or not available");
    }
  };

  // Frame streaming for live proctoring
  const startFrameStreaming = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    frameInterval.current = setInterval(() => {
      if (videoRef.current && ctx) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL('image/jpeg');
        emitStream(frame);
      }
    }, 100);
  };

  // Stop camera and face detection
  const stopCamera = (): void => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      setCameraActive(false);
    }
    if (faceDetectionInterval.current) {
      clearInterval(faceDetectionInterval.current);
    }
    if (frameInterval.current) {
      clearInterval(frameInterval.current);
    }
    // Leave the room when done
    leaveRoom();
  };

  // Prevent screen capture
  const preventScreenCapture = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor'
        }
      });
     
      stream.getTracks().forEach(track => {
        track.stop();
        setScreenCaptureAttempts(prev => prev + 1);
        recordViolation("Screen capture attempt detected");
       
        if (screenCaptureAttempts >= 1) {
          alert("Screen capture detected. Your exam will be submitted automatically.");
          submitExam();
        }
      });
    } catch (err) {
      console.log("Screen capture prevention active");
    }
  };

  // Check for developer tools
  const isDevToolsOpen = (): boolean => {
    if (process.env.NODE_ENV === 'development') {
      return false;
    }
   
    const threshold = 160;
    return (
      window.outerHeight - window.innerHeight > threshold ||
      window.outerWidth - window.innerWidth > threshold
    );
  };

  // Enhanced security check
  const performSecurityCheck = (): void => {
    if (!isTimerRunning) return;

    const checks: SecurityChecks = {
      fullscreen: Boolean(document.fullscreenElement),
      safeBrowser: false,
      noScreenCapture: screenCaptureAttempts === 0,
      noCopyPaste: true,
      noDevTools: !isDevToolsOpen(),
      noPrintScreen: !window.matchMedia('print').matches,
      noMultipleWindows: window.outerHeight === window.innerHeight &&
                        window.outerWidth === window.innerWidth
    };

    setSecurityChecks(checks);

    if (!checks.fullscreen || !checks.safeBrowser ||
        !checks.noScreenCapture || !checks.noDevTools || !checks.noMultipleWindows) {
      recordViolation("Security check failed");
      submitExam();
    }
  };

  // Enhanced security monitoring
  const startSecurityMonitoring = (): void => {
    if (securityCheckInterval.current) {
      clearInterval(securityCheckInterval.current);
    }

    if (!isTimerRunning) {
      return;
    }

    securityCheckInterval.current = setInterval(() => {
      performSecurityCheck();
      preventScreenCapture();

      if (isDevToolsOpen()) {
        recordViolation("Developer tools detected");
        alert("Developer tools detected. Your exam will be submitted automatically.");
        submitExam();
      }

      if (window.matchMedia('print').matches) {
        recordViolation("Print screen attempt detected");
        alert("Print screen detected. Your exam will be submitted automatically.");
        submitExam();
      }

      if (window.outerHeight !== window.innerHeight ||
          window.outerWidth !== window.innerWidth) {
        recordViolation("Multiple windows detected");
        alert("Multiple windows detected. Your exam will be submitted automatically.");
        submitExam();
      }
    }, 500);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (faceDetectionInterval.current) clearInterval(faceDetectionInterval.current);
      //commenting out fullscreen checks for now
      // if (fullscreenCheckInterval.current) clearInterval(fullscreenCheckInterval.current);
      // if (fullscreenLockInterval.current) clearInterval(fullscreenLockInterval.current);
      if (securityCheckInterval.current) clearInterval(securityCheckInterval.current);
      if (devToolsCheckInterval.current) clearInterval(devToolsCheckInterval.current);
      if (frameInterval.current) clearInterval(frameInterval.current);
      stopCamera();
    };
  }, []);

  const handleSectionChange = (section: string): void => {
    setCurrentSection(section);
    const sectionQuestions = examData?.sections[section]?.questions || [];
    setCurrentQuestion(sectionQuestions.length > 0 ? sectionQuestions[0] : null);
  };

  const handleQuestionChange = (question: Question | null | undefined): void => {
    if (question) setCurrentQuestion(question);
  };

  const handleAnswerChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const value = e.target.value;
    if ((e.nativeEvent as any).inputType === 'insertFromPaste') {
      e.preventDefault();
      recordViolation("Attempted to paste in answer field");
      return;
    }
    if (currentQuestion) {
      setAnswers(prev => ({
        ...prev,
        [currentQuestion.id]: value
      }));
    }
  };

  const handleMultipleChoiceAnswer = (option: string): void => {
    if (currentQuestion) {
      setAnswers(prev => ({
        ...prev,
        [currentQuestion.id]: option
      }));
    }
  };

  const handleSaveAnswer = (): void => {
    localStorage.setItem('examAnswers', JSON.stringify(answers));
    console.log(`Answer saved for question ${currentQuestion?.id}`);
   
    const isFullscreenActive = document.fullscreenElement;
   
    if (!isFullscreenActive) {
      const docElement = document.documentElement;
      if (docElement.requestFullscreen) {
        docElement.requestFullscreen();
      }
    }
  };

  const submitExam = (): void => {
    localStorage.setItem('examAnswers', JSON.stringify(answers));
    console.log("Submitting exam answers:", answers);
   
    setIsTimerRunning(false);
    stopCamera();
   
    if (faceDetectionInterval.current) clearInterval(faceDetectionInterval.current);
    // comment out fullscreen checks for now
    // if (fullscreenCheckInterval.current) clearInterval(fullscreenCheckInterval.current);
    // if (fullscreenLockInterval.current) clearInterval(fullscreenLockInterval.current);
    if (securityCheckInterval.current) clearInterval(securityCheckInterval.current);
    if (devToolsCheckInterval.current) clearInterval(devToolsCheckInterval.current);
   
    navigate('/exam-complete');
  };

  // Enhanced camera container with improved status display
  const renderCameraContainer = (): JSX.Element => (
    // <div className={styles.cameraContainer}>
    //   <h4>Proctoring Camera</h4>
    //   <div className={styles.videoWrapper}>
    //     <video
    //       ref={videoRef}
    //       autoPlay
    //       playsInline
    //       muted
    //       className={styles.cameraVideo}
    //     />
    //     <div className={`${styles.detectionOverlay} ${
    //       !isModelLoaded ? styles.loading :
    //       showMultiFaceWarning ? styles.warning :
    //       showFaceDetected ? styles.detected :
    //       showNoFaceWarning ? styles.warning :
    //       styles.noFace
    //     }`}>
    //       <div className={styles.detectionStatus}>
    //         {!isModelLoaded ? (
    //           <div className={styles.loadingMessage}>
    //             <span className={styles.loadingIcon}>⌛</span> Loading face detection...
    //           </div>
    //         ) : faceDetectionError ? (
    //           <div className={styles.errorMessage}>
    //             <span className={styles.errorIcon}>⚠️</span>
    //             {faceDetectionError}
    //           </div>
    //         ) : showNoFaceWarning ? (
    //           <div className={styles.warningMessage}>
    //             <span className={styles.warningIcon}>⚠️ No Face Detected for {noFaceTimer}s</span>
    //           </div>
    //         ) : showMultiFaceWarning ? (
    //           <div className={styles.warningMessage}>
    //             <span className={styles.warningIcon}>⚠️ Multiple Faces Detected for {multiFaceTimer}s</span>
    //           </div>
    //         ) : showFaceDetected ? (
    //           <div className={styles.successMessage}>
    //             <span className={styles.successIcon}>✓ Face Detected</span>
    //           </div>
    //         ) : (
    //           <div className={styles.statusMessage}>
    //             <span className={styles.warningIcon}>⚠️ Detecting...</span>
    //           </div>
    //         )}
    //       </div>
    //     </div>
    //   </div>
    // </div>
    <div className="fixed top-5 right-5 w-[250px] bg-[#f5f5f5] border border-[#ddd] rounded-lg p-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] z-[1000] mt-10">
  <h4 className="mb-2.5 text-[16px] text-[#333]">Proctoring Camera</h4>

  <div className="relative">
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full rounded bg-black"
    />

    {/* Detection Message - bottom-left */}
    <div className="absolute left-2 bottom-2 text-[14px]">
      {!isModelLoaded ? (
        <div className="text-[#004d47] italic">
          <span className="mr-1">⌛</span> Loading face detection...
        </div>
      ) : faceDetectionError ? (
        <div className="text-[#f44336] font-medium">
          <span className="mr-1">⚠️</span> {faceDetectionError}
        </div>
      ) : showNoFaceWarning ? (
        <div className="text-[#f44336] font-medium">
          <span className="mr-1">⚠️</span> No Face Detected for {noFaceTimer}s
        </div>
      ) : showMultiFaceWarning ? (
        <div className="text-[#f44336] font-medium">
          <span className="mr-1">⚠️</span> Multiple Faces Detected for {multiFaceTimer}s
        </div>
      ) : showFaceDetected ? (
        <div className="text-[#4CAF50] font-medium">
          <span className="mr-1">✓</span> Face Detected
        </div>
      ) : (
        <div className="text-[#f44336] font-medium">
          <span className="mr-1">⚠️</span> Detecting...
        </div>
      )}
    </div>
  </div>
</div>

  );

  const handleReady = async (): Promise<void> => {
    try {
      const docElement = document.documentElement;
      if (docElement.requestFullscreen) {
        await docElement.requestFullscreen();
      }

      setIsReady(true);
      setShowInstructions(false);
      setCurrentSection('A');
      setCurrentQuestion(examData?.sections['A'].questions?.[0] || null);
      setIsTimerRunning(true);
      initializeCamera();
      startSecurityMonitoring();
    } catch (error) {
      console.error("Error starting exam:", error);
      alert("There was an error starting the exam. Please try again.");
    }
  };

  // Fullscreen check
  // const handleFullscreenChange = (): void => {
  //   const isFullscreenActive = document.fullscreenElement;
   
  //   if (!isFullscreenActive && isTimerRunning) {
  //     localStorage.setItem('examAnswers', JSON.stringify(answers));
  //     submitExam();
  //   }
  // };

  useEffect(() => {
    // comment out fullscreen checks for now
    // document.addEventListener('fullscreenchange', handleFullscreenChange);
    // document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    // document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    // document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    const handleEscKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (isTimerRunning) {
          localStorage.setItem('examAnswers', JSON.stringify(answers));
          submitExam();
        }
      }
    };

    window.addEventListener('keydown', handleEscKey);

    return () => {
      // coomment out fullscreen checks for now
      // document.removeEventListener('fullscreenchange', handleFullscreenChange);
      // document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      // document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      // document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      // window.removeEventListener('keydown', handleEscKey);
    };
  }, [isTimerRunning, answers]);

  useEffect(() => {
    if (cameraActive && videoRef.current) {
      faceDetectionInterval.current = setInterval(() => {
        if (videoRef.current) {
          detectFaces(videoRef.current);
        }
      }, 500);
    }

    return () => {
      if (faceDetectionInterval.current) {
        clearInterval(faceDetectionInterval.current);
      }
    };
  }, [cameraActive, isModelLoaded]);

  // Fetch data from the backend using ExamNo
useEffect(() => {
  const fetchExamData = async () => {
    if (!ExamNo) return;

    try {
      const response = await fetch(`http://localhost:3001/api/exam/${ExamNo}`);
      if (!response.ok) {
        throw new Error('Failed to fetch exam data');
      }

      const data = await response.json();
      console.log('Exam data from backend:', data);
      setExamData(data);
    } catch (error) {
      console.error('Error fetching exam data:', error);
      setFetchError('Failed to load exam data.');
    } finally {
      setLoadingExam(false);
    }
  };

  fetchExamData();
}, [ExamNo]);

  // Render instructions page
  if (loadingExam) {
    return <div className={styles.examContainer}><div>Loading exam...</div></div>;
  }
  if (fetchError) {
    return <div className={styles.examContainer}><div>{fetchError}</div></div>;
  }
  if (showInstructions && examData) {
    return (
    <div className="flex flex-col h-screen w-screen bg-[#f5f5f5] font-[Segoe_UI] fixed top-0 left-0 overflow-hidden">
   <div className="max-w-[800px] mx-auto mt-20 p-8 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-h-[80vh] overflow-y-auto">
    <div className="text-center mb-4 text-[#106053] border-b-2 border-[#106053] pb-2">
      <h2>{examData.instructions.title}</h2>
    </div>
    <h1 className="text-2xl font-semibold my-6 leading-relaxed">{examData.instructions.content[0]}</h1>
    <div className="space-y-2">
      {examData.instructions.content.slice(1, 5).map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
    <div className="mt-6">
      <h3 className="font-bold text-lg mb-2">INSTRUCTIONS TO CANDIDATES</h3>
      <ol className="list-decimal pl-5 space-y-1">
        {examData.instructions.content.slice(6).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </div>
    <div className="text-center mt-8">
      <button
        onClick={handleReady}
        className="bg-[#106053] text-white px-8 py-3 rounded font-bold text-base hover:bg-[#004d47] transition-colors duration-300"
      >
        Start Exam
      </button>
    </div>
  </div>
</div>

      );
}
  const currentSectionQuestions = examData?.sections[currentSection]?.questions || [];
  const currentQuestionIndex = currentQuestion ? 
    currentSectionQuestions.findIndex(q => q.id === currentQuestion.id) : -1;
  const hasPrevQuestion = currentQuestionIndex > 0;
  const hasNextQuestion = currentQuestionIndex < currentSectionQuestions.length - 1;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f5f5f5] font-[Segoe_UI] fixed top-0 left-0 overflow-hidden">
  {!isReady ? (
    <div className="max-w-[800px] mx-auto mt-8 p-8 bg-white rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-h-[80vh] overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4 text-center">Exam Instructions</h2>
      <div className="my-6 leading-relaxed">
        <h3 className="text-lg font-semibold mb-2">{examData?.instructions.title}</h3>
        <ul className="list-disc pl-5 space-y-1 mb-4">
          {examData?.instructions.content.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
        <p className="mb-2 font-medium">Before starting the exam, please ensure:</p>
        <ul className="list-disc pl-5 space-y-1 mb-4">
          <li>You are in a quiet, well-lit environment</li>
          <li>Your camera is working properly</li>
          <li>You have a stable internet connection</li>
          <li>You have read and understood the exam rules</li>
        </ul>
        <p className="mb-6">Click the "I'm Ready" button to start the exam in full-screen mode.</p>
        <div className="text-center mt-8">
          <button
            onClick={handleReady}
            className="bg-[#106053] text-white px-8 py-3 rounded font-bold text-base hover:bg-[#004d47] transition-colors duration-300"
          >
            I'm Ready
          </button>
        </div>
      </div>
    </div>
      ) : (
        examData && (
          <>
            <div className="flex justify-between items-center px-4 py-2 bg-teal-800 text-white">
              <div className="text-lg font-semibold">Clarke International University</div>
              <div className="text-sm font-bold bg-white/20 px-4 py-1 rounded">
                Time Remaining: {String(timer.hours).padStart(2, '0')}:
                {String(timer.minutes).padStart(2, '0')}:
                {String(timer.seconds).padStart(2, '0')}
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden h-[calc(100vh-60px)] mt-8">
              {/* Sidebar */}
              <div className="w-64 bg-gray-100 border-r border-gray-300 flex flex-col overflow-y-auto">
                {Object.keys(examData.sections).map((sectionKey) => (
                  <div key={sectionKey} className="mb-2">
                    <div
                      className={`px-4 py-3 font-bold cursor-pointer border-l-4 ${
                        currentSection === sectionKey ? 'bg-gray-300 border-teal-800' : 'bg-gray-200 border-transparent'
                      }`}
                      onClick={() => handleSectionChange(sectionKey)}
                    >
                      {examData.sections[sectionKey].title}
                    </div>
                    {currentSection === sectionKey && (
                      <div className="py-2">
                        {examData.sections[sectionKey].questions.length === 0 ? (
                          <div className="text-center text-sm text-gray-500">No questions in this section.</div>
                        ) : (
                          examData.sections[sectionKey].questions.map((question) => (
                            <div
                              key={question.id}
                              className={`pl-8 pr-4 py-2 cursor-pointer border-l-4 ${
                                currentQuestion?.id === question.id ? 'bg-blue-100 border-teal-400' : 'border-transparent'
                              }`}
                              onClick={() => handleQuestionChange(question)}
                            >
                              {question.id}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Proctoring Status */}
                <div className="p-4 text-sm">
                  <h4 className="font-semibold mb-2">Proctoring Status</h4>
                  <div className="flex justify-between mb-1">
                    <span>Security Status:</span>
                    <span className={`${Object.values(securityChecks).every(check => check) ? 'text-green-600' : 'text-red-500'}`}>
                      {Object.values(securityChecks).every(check => check) ? 'All Secure' : 'Security Compromised'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Browser:</span>
                    <span className={`${isSupportedBrowser() ? 'text-green-600' : 'text-red-500'}`}>
                      {isSupportedBrowser() ? 'Supported' : 'Unsupported'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Camera:</span>
                    <span className={`${cameraActive ? 'text-green-600' : 'text-red-500'}`}>
                      {cameraActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Screen Capture:</span>
                    <span className={`${screenCaptureAttempts === 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {screenCaptureAttempts === 0 ? 'Blocked' : 'Attempted'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Dev Tools:</span>
                    <span className={`${!isDevToolsOpen() ? 'text-green-600' : 'text-red-500'}`}>
                      {!isDevToolsOpen() ? 'Blocked' : 'Detected'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Multiple Windows:</span>
                    <span className={`${window.outerHeight === window.innerHeight && window.outerWidth === window.innerWidth ? 'text-green-600' : 'text-red-500'}`}>
                      {window.outerHeight === window.innerHeight && window.outerWidth === window.innerWidth ? 'Blocked' : 'Detected'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Violations:</span>
                    <span className={`${violations.length > 0 ? 'text-red-500' : 'text-green-600'}`}>{violations.length}</span>
                  </div>
                </div>

                <button
                  className="mt-auto mx-4 mb-4 bg-teal-800 text-white py-2 px-4 font-bold hover:bg-[#004d47]"
                  onClick={submitExam}
                >
                  Submit Exam
                </button>
              </div>

              {/* Question Container */}
              <div className="flex-1 p-6 overflow-y-auto">
                {currentQuestion ? (
                  <>
                    <div className="mb-6">
                      <h3 className="text-xl font-semibold">
                        {examData.sections[currentSection].title}: Question {currentQuestion.id}
                      </h3>
                      <p className="text-sm italic text-gray-600">
                        {examData.sections[currentSection].description}
                      </p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow">
                      <p className="text-lg mb-4 leading-relaxed">{currentQuestion.text}</p>
                      {currentQuestion.type === 'multiple-choice' && currentQuestion.options && (
                        <div className="flex flex-col gap-3">
                          {currentQuestion.options.map((option, index) => (
                            <div
                              key={index}
                              className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                                answers[currentQuestion.id] === option ? 'bg-blue-100 border-teal-400' : 'hover:bg-gray-100'
                              }`}
                              onClick={() => handleMultipleChoiceAnswer(option)}
                            >
                              <span className={`w-8 h-8 flex items-center justify-center rounded-full mr-3 font-bold ${
                                answers[currentQuestion.id] === option ? 'bg-teal-400 text-white' : 'bg-gray-200'
                              }`}>
                                {String.fromCharCode(65 + index)}
                              </span>
                              <span>{option}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(currentQuestion.type === 'short-answer' || currentQuestion.type === 'essay') && (
                        <textarea
                          className={`w-full mt-4 p-3 border rounded resize-y font-sans ${
                            currentQuestion.type === 'essay' ? 'min-h-[200px]' : 'min-h-[150px]'
                          }`}
                          value={answers[currentQuestion.id] || ''}
                          onChange={handleAnswerChange}
                          placeholder={`Type your ${currentQuestion.type === 'essay' ? 'essay' : 'answer'} here...`}
                        />
                      )}
                    </div>
                    <div className="mt-4 flex justify-between">
                      {hasPrevQuestion && (
                        <button
                          className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
                          onClick={() => handleQuestionChange(currentSectionQuestions[currentQuestionIndex - 1])}
                        >
                          Previous Question
                        </button>
                      )}
                      <button
                        className="bg-[#106053] text-white px-4 py-2 rounded hover:bg-[#004d47]"
                        onClick={handleSaveAnswer}
                      >
                        Save Answer
                      </button>
                      {hasNextQuestion && (
                        <button
                          className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
                          onClick={() => handleQuestionChange(currentSectionQuestions[currentQuestionIndex + 1])}
                        >
                          Next Question
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500">No question selected or available in this section.</div>
                )}
              </div>
              {renderCameraContainer()}
            </div>
          </>
        )
      )}
    </div>
    
  );
}


export default ExamPage;