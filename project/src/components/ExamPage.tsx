import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styles from './Exam.module.css';
import * as faceapi from 'face-api.js';
import { emitStream, joinRoom, leaveRoom } from '../config/socket';
import axios from 'axios';
import ExamInstructions from './ExamInstructions';

// Type definitions
export type Timer = { hours: number; minutes: number; seconds: number };
export type SecurityChecks = {
  fullscreen: boolean;
  safeBrowser: boolean;
  noScreenCapture: boolean;
  noCopyPaste: boolean;
  noDevTools: boolean;
  noPrintScreen: boolean;
  noMultipleWindows: boolean;
};
export type Violation = { type: string; timestamp: string };
export type Subpart = { id: string; text: string };
export type Question = {
  id: string;
  text: string;
  type: 'multiple-choice' | 'short-answer' | 'essay';
  options?: string[];
  subparts?: Subpart[];
  section?: string;
  subsection?: string;
};
export type Subsection = { id: string; title: string; questions: Question[] };
export type Section = { title: string; description: string; subsections: Subsection[] };
export type ExamData = { instructions: { title: string; content: string[] }; sections: { [key: string]: Section } };

const ExamPage: React.FC = () => {
  const [showInstructions, setShowInstructions] = useState<boolean>(true);
  const [currentSection, setCurrentSection] = useState<string>('');
  const [currentSubsection, setCurrentSubsection] = useState<string>('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [flatQuestions, setFlatQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timer, setTimer] = useState<Timer>({ hours: 3, minutes: 0, seconds: 0 });
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [screenCaptureAttempts, setScreenCaptureAttempts] = useState<number>(0);
  const [securityChecks, setSecurityChecks] = useState<SecurityChecks>({
    fullscreen: false,
    safeBrowser: false,
    noScreenCapture: false,
    noCopyPaste: true,
    noDevTools: false,
    noPrintScreen: false,
    noMultipleWindows: false,
  });
  const [isReady, setIsReady] = useState<boolean>(false);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceDetectionError, setFaceDetectionError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [loadingExam, setLoadingExam] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [registrationNumber, setRegistrationNumber] = useState<string>('');
  const [regNumberError, setRegNumberError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const faceDetectionInterval = useRef<NodeJS.Timeout | null>(null);
  const fullscreenCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const fullscreenLockInterval = useRef<NodeJS.Timeout | null>(null);
  const securityCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const devToolsCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const frameInterval = useRef<NodeJS.Timeout | null>(null);
  const detectionBufferRef = useRef<number[]>([]);
  const navigate = useNavigate();
  const { roomId, examNo } = useParams<{ roomId: string; examNo: string }>();
  const [smoothedDetection, setSmoothedDetection] = useState<0 | 1 | 2>(1);
  const [noFaceTimer, setNoFaceTimer] = useState(0);
  const [multiFaceTimer, setMultiFaceTimer] = useState(0);

  const isSupportedBrowser = () => {
    const ua = window.navigator.userAgent;
    return /Chrome\/|Edg\/|Safari\//.test(ua) && !/OPR\//.test(ua);
  };

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionKey)) {
        newSet.delete(sectionKey);
      } else {
        newSet.add(sectionKey);
      }
      return newSet;
    });
  };

  const parsePDFTextToExamData = (lines: string[]): ExamData => {
    const instructions = { title: '', content: [] };
    const sections: { [key: string]: Section } = {};
    let currentSection = 'A';
    let currentSubsection = 'main';
    let currentQuestionText: string[] = [];
    let collectingQuestion = false;
    let questionIdCounter = 1;
    let inInstructions = true;
    let instructionLines: string[] = [];
    let currentOptions: string[] = [];
    let questionType: 'multiple-choice' | 'short-answer' | 'essay' = 'essay';
    let sectionCounter = 0;
    let currentSubparts: Subpart[] = [];
    let currentParentQuestionId: string | null = null;

    const sectionRegex = /^\s*(Section|Part)\s+([A-C]|\d+|[IVX]+)(?:\.|\s|$)/i;
    const questionRegex = /^\s*(?:\d+|Q\d+|Qtn\d+|Question\s+\d+|\d+\))\.\s*/i; // Adjusted to catch "Question One:" as well
    const subQuestionRegex = /^\s*([a-d])\)\s*/i;
    const optionRegex = /^\s*([a-d])\.\s*/i;
    const marksRegex = /\b(\d+)\s*marks\b/i;

    sections[currentSection] = {
      title: `Section ${currentSection}`,
      description: '',
      subsections: [{ id: 'main', title: '', questions: [] }],
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.length < 2) return;

      if (inInstructions) {
        // Continue collecting instructions until a clear question or section marker is detected
        if (sectionRegex.test(trimmedLine) || questionRegex.test(trimmedLine)) {
          inInstructions = false;
          if (instructionLines.length > 0) {
            instructions.title = instructionLines[0] || 'Exam Instructions';
            instructions.content = instructionLines
              .slice(1) // Skip the title line
              .filter((l) => l && !/^\s*$/.test(l) && !/Page \d+ of \d+/i.test(l) && !/©/.test(l));
          }
        } else {
          instructionLines.push(trimmedLine);
          return;
        }
      }

      if (!inInstructions) {
        if (sectionRegex.test(trimmedLine)) {
          if (collectingQuestion && currentQuestionText.length) {
            const questionText = currentQuestionText.join(' ').trim();
            if (questionText) {
              const question: Question = {
                id: currentParentQuestionId || `Qtn${questionIdCounter}`,
                text: questionText,
                type: questionType,
                ...(currentOptions.length ? { options: currentOptions.filter(opt => opt.trim()) } : {}),
                ...(currentSubparts.length ? { subparts: currentSubparts } : {}),
              };
              const subsection = sections[currentSection].subsections.find((sub) => sub.id === currentSubsection);
              if (subsection) {
                subsection.questions.push(question);
                questionIdCounter++;
              }
            }
          }
          const sectionMatch = trimmedLine.match(sectionRegex);
          currentSection = sectionMatch ? sectionMatch[2].toUpperCase() : `S${++sectionCounter}`;
          sections[currentSection] = {
            title: `Section ${currentSection}`,
            description: '',
            subsections: [{ id: 'main', title: '', questions: [] }],
          };
          currentSubsection = 'main';
          collectingQuestion = false;
          currentQuestionText = [];
          currentOptions = [];
          currentSubparts = [];
          questionType = 'essay';
          currentParentQuestionId = null;
          questionIdCounter = 1;
        } else if (questionRegex.test(trimmedLine)) {
          if (collectingQuestion && currentQuestionText.length) {
            const questionText = currentQuestionText.join(' ').trim();
            if (questionText) {
              const question: Question = {
                id: currentParentQuestionId || `Qtn${questionIdCounter}`,
                text: questionText,
                type: questionType,
                ...(currentOptions.length ? { options: currentOptions.filter(opt => opt.trim()) } : {}),
                ...(currentSubparts.length ? { subparts: currentSubparts } : {}),
              };
              const subsection = sections[currentSection].subsections.find((sub) => sub.id === currentSubsection);
              if (subsection) {
                subsection.questions.push(question);
                questionIdCounter++;
              }
            }
          }
          collectingQuestion = true;
          currentQuestionText = [trimmedLine.replace(questionRegex, '').trim()];
          currentOptions = [];
          currentSubparts = [];
          currentParentQuestionId = `Qtn${questionIdCounter}`;
          const marksMatch = trimmedLine.match(marksRegex);
          if (marksMatch) {
            const marks = parseInt(marksMatch[1], 10);
            questionType = marks <= 2 ? 'multiple-choice' : marks <= 5 ? 'short-answer' : 'essay';
          } else {
            questionType = 'essay';
          }
        } else if (subQuestionRegex.test(trimmedLine) && collectingQuestion) {
          const subpartMatch = trimmedLine.match(subQuestionRegex);
          const subpartId = subpartMatch ? subpartMatch[1] : '';
          const subpartText = trimmedLine.replace(subQuestionRegex, '').trim();
          if (subpartText) {
            currentSubparts.push({ id: subpartId, text: subpartText });
          }
          const marksMatch = trimmedLine.match(marksRegex);
          if (marksMatch) {
            const marks = parseInt(marksMatch[1], 10);
            questionType = marks <= 2 ? 'multiple-choice' : marks <= 5 ? 'short-answer' : 'essay';
          } else {
            questionType = 'short-answer';
          }
        } else if (optionRegex.test(trimmedLine) && collectingQuestion && !currentSubparts.length) {
          const optionText = trimmedLine.replace(optionRegex, '').trim();
          if (optionText) {
            currentOptions.push(optionText);
            questionType = 'multiple-choice';
          }
        } else if (trimmedLine && !/Page \d+ of \d+/i.test(trimmedLine) && !/End and Good luck/i.test(trimmedLine)) {
          if (collectingQuestion) {
            currentQuestionText.push(trimmedLine);
          } else if (currentSection && !sections[currentSection].description) {
            sections[currentSection].description = trimmedLine;
          }
        }
      }
    });

    if (collectingQuestion && currentQuestionText.length) {
      const questionText = currentQuestionText.join(' ').trim();
      if (questionText) {
        const question: Question = {
          id: currentParentQuestionId || `Qtn${questionIdCounter}`,
          text: questionText,
          type: questionType,
          ...(currentOptions.length ? { options: currentOptions.filter(opt => opt.trim()) } : {}),
          ...(currentSubparts.length ? { subparts: currentSubparts } : {}),
        };
        const subsection = sections[currentSection].subsections.find((sub) => sub.id === currentSubsection);
        if (subsection) {
          subsection.questions.push(question);
        }
      }
    }

    if (!Object.keys(sections).length || !Object.values(sections).some((section) => section.subsections.some((sub) => sub.questions.length))) {
      sections['A'] = {
        title: 'Section A',
        description: '',
        subsections: [{ id: 'main', title: '', questions: [] }],
      };
    }

    return { instructions, sections };
  };

  const flattenQuestions = (examData: ExamData): Question[] => {
    const questions: Question[] = [];
    Object.keys(examData.sections).forEach((sectionKey) => {
      examData.sections[sectionKey].subsections.forEach((subsection) => {
        subsection.questions.forEach((question) => {
          questions.push({ ...question, section: sectionKey, subsection: subsection.id });
        });
      });
    });
    return questions;
  };

  const fetchExam = async (retries = 3, delay = 1000): Promise<void> => {
    setLoadingExam(true);
    setFetchError(null);
    try {
      let finalExamData: ExamData;
      if (examNo) {
        const pdfUrl = `https://eadmin.ciu.ac.ug/API/doc_verification.aspx?doc=Exam&ExamNo=${examNo}`;
        const response = await axios.post('http://localhost:3001/pdf', { pdfUrl }, { timeout: 15000 });
        console.log('PDF response:', response.data);
        if (response.status !== 200) {
          throw new Error(`Backend returned status ${response.status}`);
        }
        if (!response.data.lines) {
          throw new Error(response.data.error || 'No lines returned from PDF parsing');
        }
        finalExamData = parsePDFTextToExamData(response.data.lines);
        console.log('Parsed examData:', JSON.stringify(finalExamData, null, 2));
      } else {
        throw new Error('No exam number provided');
      }
      setExamData(finalExamData);
      setFlatQuestions(flattenQuestions(finalExamData));
      if (Object.keys(finalExamData.sections).length) {
        const firstSection = Object.keys(finalExamData.sections)[0];
        setCurrentSection(firstSection);
        setExpandedSections(new Set([firstSection]));
        const firstSubsection = finalExamData.sections[firstSection].subsections[0]?.id || 'main';
        setCurrentSubsection(firstSubsection);
      }
    } catch (err: any) {
      let errorMessage = 'Failed to load exam data';
      if (err.response?.data?.error) {
        errorMessage = `${err.response.data.error}: ${err.response.data.details || 'No details provided'}`;
      } else if (err.code === 'ERR_NETWORK') {
        errorMessage = 'Network error: Unable to connect to the server';
      } else {
        errorMessage = err.message;
      }
      if (retries > 0 && (err.code === 'ERR_NETWORK' || err.response?.status === 429 || err.response?.status === 503)) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchExam(retries - 1, delay * 2);
      }
      setExamData({
        instructions: {
          title: 'Exam Instructions',
          content: ['Unable to load exam data. Please contact support.'],
        },
        sections: {
          A: {
            title: 'Section A',
            description: '',
            subsections: [
              {
                id: 'main',
                title: '',
                questions: [{ id: 'Qtn1', text: 'Sample question.', type: 'essay' }],
              },
            ],
          },
        },
      });
      setFlatQuestions(flattenQuestions({
        instructions: { title: 'Exam Instructions', content: ['Sample Instructions'] },
        sections: {
          A: {
            title: 'Section A',
            description: '',
            subsections: [
              {
                id: 'main',
                title: '',
                questions: [{ id: 'Qtn1', text: 'Sample question.', type: 'essay' }],
              },
            ],
          },
        },
      }));
      setFetchError(errorMessage);
    } finally {
      setLoadingExam(false);
    }
  };

  const parseExamQuestions = (examData: ExamData) => {
    console.log('Raw Exam Data:', examData);

    return Object.values(examData.sections).flatMap((section) =>
      section.subsections.flatMap((subsection) =>
        subsection.questions.map((question: Question) => {
          const mainQuestionPattern = /Write short notes on the following \[\d+ marks\]/i;
          const marksPattern = /\[(\d+)\s*marks\]/i;

          if (mainQuestionPattern.test(question.text)) {
            const marksMatch = question.text.match(marksPattern);
            const marks = marksMatch ? parseInt(marksMatch[1], 10) : null;

            const mainTextEndIndex = question.text.indexOf('[');
            const mainText = mainTextEndIndex !== -1 ? question.text.substring(0, mainTextEndIndex).trim() : question.text.trim();

            const subpartsText = question.text.substring(mainTextEndIndex).replace(marksPattern, '').trim();
            const knownSubparts = [
              'Supply induced demand in health care',
              'Quality Adjusted Life Years (QALYs)',
              'Incremental Cost Effectiveness Rate',
              'Disability Adjusted Life Years (DALYs)',
            ];
            let remainingText = subpartsText;
            const subparts: Subpart[] = [];
            let subpartIndex = 0;

            while (remainingText.length > 0 && subpartIndex < knownSubparts.length) {
              const subpartText = knownSubparts[subpartIndex];
              if (remainingText.startsWith(subpartText)) {
                subparts.push({
                  id: String.fromCharCode(97 + subpartIndex),
                  text: subpartText,
                });
                remainingText = remainingText.substring(subpartText.length).trim();
                subpartIndex++;
              } else {
                break;
              }
            }

            if (subparts.length > 0) {
              console.log('Detected Essay Question with Subparts:', question.text);
              return {
                id: question.id,
                text: mainText,
                type: 'essay',
                marks: marks || undefined,
                subparts,
              };
            }
          }

          if (question.options && question.options.length > 0 && question.options.every(opt => opt.trim() === '')) {
            delete question.options;
            return {
              ...question,
              type: 'essay',
            };
          }

          return question;
        })
      )
    );
  };

  useEffect(() => {
    if (examData) {
      const parsedQuestions = parseExamQuestions(examData);
      setParsedQuestions(parsedQuestions as Question[]);
      setFlatQuestions(parsedQuestions as Question[]);
      console.log('Parsed Questions:', parsedQuestions);
    }
  }, [examData]);

  useEffect(() => {
    fetchExam();
  }, [examNo]);

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimer((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) {
          seconds = 59;
          minutes--;
          if (minutes < 0) {
            minutes = 59;
            hours--;
            if (hours < 0) {
              submitExam();
              return prev;
            }
          }
        }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const recordViolation = (type: string): void => {
    const violation: Violation = { type, timestamp: new Date().toISOString() };
    setViolations((prev) => [...prev, violation]);
    console.log('Violation recorded:', violation);
  };

  useEffect(() => {
    const loadModels = async (): Promise<void> => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        setIsModelLoaded(true);
        console.log('Face detection models loaded successfully');
      } catch (error) {
        setFaceDetectionError('Face detection model failed to load.');
        console.log('Face detection model load error:', error);
      }
    };
    loadModels();
  }, []);

  const DETECTION_BUFFER_SIZE = 6;
  const NO_FACE_WARNING_SECONDS = 3;
  const MULTIPLE_FACE_WARNING_SECONDS = 2;

  const detectFaces = async (video: HTMLVideoElement): Promise<void> => {
    if (!video || !isModelLoaded) return;
    try {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
      );
      let detectionType: 0 | 1 | 2 = detections.length === 1 ? 1 : detections.length > 1 ? 2 : 0;
      detectionBufferRef.current.push(detectionType);
      if (detectionBufferRef.current.length > DETECTION_BUFFER_SIZE) {
        detectionBufferRef.current.shift();
      }
      const smoothedType = detectionBufferRef.current.reduce((acc, val) => acc + val, 0) >= DETECTION_BUFFER_SIZE ? 2 : detectionType;
      setSmoothedDetection(smoothedType);
      console.log('Face detection:', { detections: detections.length, smoothedType });
    } catch (error) {
      setFaceDetectionError('Face detection failed. Please check your camera.');
      console.log('Face detection error:', error);
    }
  };

  useEffect(() => {
    if (!detectionBufferRef.current) {
      console.error('detectionBufferRef is undefined, initializing now');
      detectionBufferRef.current = [];
    }
    let noFaceInt: NodeJS.Timeout | undefined;
    let multiFaceInt: NodeJS.Timeout | undefined;
    if (smoothedDetection === 0) {
      noFaceInt = setInterval(() => setNoFaceTimer((t) => t + 1), 1000);
    } else {
      setNoFaceTimer(0);
    }
    const multiFaceBufferStable =
      detectionBufferRef.current.length === DETECTION_BUFFER_SIZE && detectionBufferRef.current.every((v) => v === 2);
    if (multiFaceBufferStable) {
      multiFaceInt = setInterval(() => setMultiFaceTimer((t) => t + 1), 1000);
    } else {
      setMultiFaceTimer(0);
    }
    return () => {
      if (noFaceInt) clearInterval(noFaceInt);
      if (multiFaceInt) clearInterval(multiFaceInt);
    };
  }, [smoothedDetection]);

  const showNoFaceWarning = smoothedDetection === 0 && noFaceTimer >= NO_FACE_WARNING_SECONDS;
  const showMultiFaceWarning =
    detectionBufferRef.current.length === DETECTION_BUFFER_SIZE &&
    detectionBufferRef.current.every((v) => v === 2) &&
    multiFaceTimer >= MULTIPLE_FACE_WARNING_SECONDS;
  const showFaceDetected = smoothedDetection === 1;

  const initializeCamera = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { min: 640, ideal: 1280 }, height: { min: 480, ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } },
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
        if (roomId) joinRoom(roomId);
        startFrameStreaming();
        console.log('Camera initialized successfully');
      }
    } catch (err) {
      setCameraError('Camera access denied or not available');
      console.log('Camera initialization error:', err);
    }
  };

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
    console.log('Started frame streaming');
  };

  const stopCamera = (): void => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      setCameraActive(false);
    }
    if (faceDetectionInterval.current) clearInterval(faceDetectionInterval.current);
    if (frameInterval.current) clearInterval(frameInterval.current);
    leaveRoom();
    console.log('Camera stopped');
  };

  const preventScreenCapture = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' } });
      stream.getTracks().forEach((track) => {
        track.stop();
        setScreenCaptureAttempts((prev) => prev + 1);
        recordViolation('Screen capture attempt detected');
        if (screenCaptureAttempts >= 1) {
          alert('Screen capture detected. Your exam will be submitted automatically.');
          submitExam();
        }
      });
    } catch (err) {
      console.log('Screen capture prevention active');
    }
  };

  const isDevToolsOpen = (): boolean => {
    if (process.env.NODE_ENV === 'development') return false;
    const threshold = 160;
    return window.outerHeight - window.innerHeight > threshold || window.outerWidth - window.innerWidth > threshold;
  };

  const performSecurityCheck = (): void => {
    if (!isTimerRunning) return;
    const checks: SecurityChecks = {
      fullscreen: Boolean(document.fullscreenElement),
      safeBrowser: isSupportedBrowser(),
      noScreenCapture: screenCaptureAttempts === 0,
      noCopyPaste: true,
      noDevTools: !isDevToolsOpen(),
      noPrintScreen: !window.matchMedia('print').matches,
      noMultipleWindows: window.outerHeight === window.innerHeight && window.outerWidth === window.innerWidth,
    };
    setSecurityChecks(checks);
    console.log('Security checks:', checks);
    if (!checks.noScreenCapture || !checks.noDevTools || !checks.noMultipleWindows) {
      recordViolation('Security check failed');
      submitExam();
    }
  };

  const startSecurityMonitoring = (): void => {
    if (securityCheckInterval.current) clearInterval(securityCheckInterval.current);
    if (!isTimerRunning) return;
    securityCheckInterval.current = setInterval(() => {
      performSecurityCheck();
      preventScreenCapture();
      if (isDevToolsOpen()) {
        recordViolation('Developer tools detected');
        alert('Developer tools detected. Your exam will be submitted automatically.');
        submitExam();
      }
      if (window.matchMedia('print').matches) {
        recordViolation('Print screen attempt detected');
        alert('Print screen detected. Your exam will be submitted automatically.');
        submitExam();
      }
      if (window.outerHeight !== window.innerHeight || window.outerWidth !== window.innerWidth) {
        recordViolation('Multiple windows detected');
        alert('Multiple windows detected. Your exam will be submitted automatically.');
        submitExam();
      }
    }, 500);
    console.log('Started security monitoring');
  };

  useEffect(() => {
    return () => {
      if (faceDetectionInterval.current) clearInterval(faceDetectionInterval.current);
      if (fullscreenCheckInterval.current) clearInterval(fullscreenCheckInterval.current);
      if (fullscreenLockInterval.current) clearInterval(fullscreenLockInterval.current);
      if (securityCheckInterval.current) clearInterval(securityCheckInterval.current);
      if (devToolsCheckInterval.current) clearInterval(devToolsCheckInterval.current);
      if (frameInterval.current) clearInterval(frameInterval.current);
      stopCamera();
    };
  }, []);

  const handleQuestionNavigation = (index: number): void => {
    if (index >= 0 && index < flatQuestions.length) {
      setCurrentQuestionIndex(index);
      const question = flatQuestions[index];
      setCurrentSection(question.section || '');
      setCurrentSubsection(question.subsection || '');
    }
  };

  const handleAnswerChange = (questionId: string, subpartId: string | null, value: string, event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    if ((event.nativeEvent as any).inputType === 'insertFromPaste') {
      event.preventDefault();
      recordViolation('Attempted to paste in answer field');
      return;
    }
    const answerKey = subpartId ? `${questionId}${subpartId}` : questionId;
    setAnswers((prev) => ({ ...prev, [answerKey]: value }));
  };

  const handleMultipleChoiceAnswer = (questionId: string, option: string): void => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleSaveAnswer = (): void => {
    localStorage.setItem('examAnswers', JSON.stringify(answers));
    const isFullscreenActive = document.fullscreenElement;
    if (!isFullscreenActive) {
      const docElement = document.documentElement;
      if (docElement.requestFullscreen) {
        docElement.requestFullscreen();
      }
    }
    console.log('Answers saved:', answers);
  };

  const submitExam = (): void => {
    localStorage.setItem('examAnswers', JSON.stringify({ ...answers, registrationNumber }));
    setIsTimerRunning(false);
    stopCamera();
    navigate('/exam-complete');
    console.log('Exam submitted with answers:', { ...answers, registrationNumber });
  };

  const renderCameraContainer = (): JSX.Element => (
    <div className="fixed top-5 right-5 w-[250px] bg-white border border-gray-200 rounded-lg p-4 shadow-lg z-[1000]">
      <h4 className="mb-2 text-sm font-semibold text-gray-800">Proctoring Camera</h4>
      <div className="relative">
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded bg-black" />
        <div className="absolute left-2 bottom-2 text-sm">
          {!isModelLoaded ? (
            <div className="text-teal-600 italic">⌛ Loading face detection...</div>
          ) : faceDetectionError ? (
            <div className="text-red-500 font-medium">⚠️ {faceDetectionError}</div>
          ) : showNoFaceWarning ? (
            <div className="text-red-500 font-medium">⚠️ No Face Detected for {noFaceTimer}s</div>
          ) : showMultiFaceWarning ? (
            <div className="text-red-500 font-medium">⚠️ Multiple Faces Detected for {multiFaceTimer}s</div>
          ) : showFaceDetected ? (
            <div className="text-green-600 font-medium">✓ Face Detected</div>
          ) : (
            <div className="text-red-500 font-medium">⚠️ Detecting...</div>
          )}
        </div>
      </div>
    </div>
  );

  const handleStartExam = async (): Promise<void> => {
    if (!registrationNumber.match(/^\d{4}[A-Z]+-F\d+$/)) {
      setRegNumberError('Please enter a valid Registration Number (e.g., 2022BMLSPT-F08)');
      return;
    }
    try {
      const docElement = document.documentElement;
      if (docElement.requestFullscreen) {
        await docElement.requestFullscreen();
      }
      setIsReady(true);
      setShowInstructions(false);
      setIsTimerRunning(true);
      initializeCamera();
      startSecurityMonitoring();
      console.log('Exam started with registration number:', registrationNumber);
    } catch (error) {
      alert('Error starting exam. Please try again.');
      console.log('Error starting exam:', error);
    }
  };

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

  const hasSections = examData
    ? Object.keys(examData.sections).some(
        (key) => key !== 'A' && examData.sections[key].subsections.some((sub) => sub.questions.length > 0)
      )
    : false;

  if (loadingExam) {
    return <div className="h-screen flex items-center justify-center bg-gray-100">Loading exam...</div>;
  }
  if (fetchError) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-100">
        <div className="text-red-500 text-lg mb-4">{fetchError}</div>
        <p className="text-gray-600 mb-4">Sample exam data is being used. Contact support for assistance.</p>
        <button
          className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition"
          onClick={() => fetchExam()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (showInstructions && examData) {
    return (
      <ExamInstructions
        examData={examData}
        registrationNumber={registrationNumber}
        setRegistrationNumber={setRegistrationNumber}
        regNumberError={regNumberError}
        setRegNumberError={setRegNumberError}
        handleStartExam={handleStartExam}
      />
    );
  }

  const currentQuestion = flatQuestions[currentQuestionIndex];

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans">
      <div className="flex justify-between items-center px-6 py-3 bg-teal-800 text-white shadow">
        <div className="text-lg font-semibold">Clarke International University</div>
        <div className="text-sm font-bold bg-white/20 px-4 py-1 rounded">
          Time Remaining: {String(timer.hours).padStart(2, '0')}:{String(timer.minutes).padStart(2, '0')}:{String(timer.seconds).padStart(2, '0')}
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 bg-white border-r border-gray-200 shadow-lg overflow-y-auto">
          {hasSections ? (
            Object.keys(examData?.sections || {})
              .filter((key) => key !== 'A')
              .map((sectionKey) => (
                <div key={sectionKey} className="border-b border-gray-200">
                  <div
                    className={`px-4 py-3 font-semibold cursor-pointer transition flex justify-between items-center ${
                      currentSection === sectionKey ? 'bg-teal-100 text-teal-800 border-l-4 border-teal-600' : 'text-gray-700'
                    }`}
                    onClick={() => {
                      toggleSection(sectionKey);
                      const firstQuestionInSection = flatQuestions.find((q) => q.section === sectionKey);
                      if (firstQuestionInSection && !currentSection) {
                        handleQuestionNavigation(flatQuestions.indexOf(firstQuestionInSection));
                      }
                    }}
                  >
                    <span>{examData?.sections[sectionKey].title}</span>
                    <span>{expandedSections.has(sectionKey) ? '▼' : '▶'}</span>
                  </div>
                  {expandedSections.has(sectionKey) && (
                    <div className="pl-4 py-2">
                      {examData?.sections[sectionKey].subsections.map((subsection) => (
                        <div key={subsection.id} className="mb-2">
                          {subsection.title && (
                            <div className="pl-4 font-medium text-gray-600">{subsection.title}</div>
                          )}
                          <div className="pl-4">
                            {subsection.questions.map((question) => (
                              <div
                                key={question.id}
                                className={`px-2 py-2 cursor-pointer transition ${
                                  flatQuestions[currentQuestionIndex]?.id === question.id ? 'text-teal-600 font-medium' : 'text-gray-600'
                                }`}
                                onClick={() => handleQuestionNavigation(flatQuestions.findIndex((q) => q.id === question.id))}
                              >
                                {question.id}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
          ) : (
            <div className="border-b border-gray-200">
              <div className="px-4 py-3 font-semibold text-gray-700">Questions</div>
              <div className="pl-4 py-2">
                {flatQuestions.map((question, index) => (
                  <div
                    key={question.id}
                    className={`px-2 py-2 cursor-pointer transition ${
                      currentQuestionIndex === index ? 'text-teal-600 font-medium' : 'text-gray-600'
                    }`}
                    onClick={() => handleQuestionNavigation(index)}
                  >
                    {question.id}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="p-4">
            <h4 className="font-semibold text-gray-800 mb-2">Proctoring Status</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Security Status:</span>
                <span className={Object.values(securityChecks).every((check) => check) ? 'text-green-600' : 'text-red-500'}>
                  {Object.values(securityChecks).every((check) => check) ? 'Secure' : 'Compromised'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Browser:</span>
                <span className={isSupportedBrowser() ? 'text-green-600' : 'text-red-500'}>
                  {isSupportedBrowser() ? 'Supported' : 'Unsupported'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Camera:</span>
                <span className={cameraActive ? 'text-green-600' : 'text-red-500'}>{cameraActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="flex justify-between">
                <span>Screen Capture:</span>
                <span className={screenCaptureAttempts === 0 ? 'text-green-600' : 'text-red-500'}>
                  {screenCaptureAttempts === 0 ? 'Blocked' : 'Attempted'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Dev Tools:</span>
                <span className={!isDevToolsOpen() ? 'text-green-600' : 'text-red-500'}>{!isDevToolsOpen() ? 'Blocked' : 'Detected'}</span>
              </div>
              <div className="flex justify-between">
                <span>Multiple Windows:</span>
                <span
                  className={
                    window.outerHeight === window.innerHeight && window.outerWidth === window.innerWidth ? 'text-green-600' : 'text-red-500'
                  }
                >
                  {window.outerHeight === window.innerHeight && window.outerWidth === window.innerWidth ? 'Blocked' : 'Detected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Violations:</span>
                <span className={violations.length > 0 ? 'text-red-500' : 'text-green-600'}>{violations.length}</span>
              </div>
            </div>
            <button
              className="mt-4 w-full bg-teal-600 text-white py-2 rounded-lg font-semibold hover:bg-teal-700"
              onClick={submitExam}
            >
              Submit Exam
            </button>
          </div>
        </div>
        <div className="flex-1 p-8 overflow-y-auto">
          {currentQuestion ? (
            <div className="bg-white p-6 rounded-lg shadow-lg">
              {hasSections && currentSection !== 'A' && (
                <h2 className="text-2xl font-bold text-teal-800 mb-4">
                  {examData?.sections[currentQuestion.section || ''].title}
                </h2>
              )}
              <div className="p-4 mb-4 border rounded-lg border-teal-600 bg-teal-50">
                <p className="text-lg text-gray-700 mb-4">
                  <strong>{currentQuestion.id}</strong>: {currentQuestion.text}
                </p>
                {currentQuestion.subparts && currentQuestion.subparts.length > 0 ? (
                  currentQuestion.subparts.map((subpart) => (
                    <div key={`${currentQuestion.id}${subpart.id}`} className="mb-4">
                      <p className="text-md text-gray-700 mb-2">
                        <strong>{subpart.id})</strong> {subpart.text}
                      </p>
                      <textarea
                        className="w-full p-4 border border-gray-300 rounded-lg min-h-[100px] focus:outline-none focus:ring-2 focus:ring-teal-600"
                        value={answers[`${currentQuestion.id}${subpart.id}`] || ''}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, subpart.id, e.target.value, e)}
                        placeholder={`Type your answer for part ${subpart.id} here...`}
                      />
                    </div>
                  ))
                ) : currentQuestion.type === 'multiple-choice' && currentQuestion.options && currentQuestion.options.length > 0 ? (
                  <div className="space-y-3">
                    {currentQuestion.options.map((option, index) => (
                      <div
                        key={index}
                        className={`flex items-center p-3 border rounded-lg cursor-pointer transition ${
                          answers[currentQuestion.id] === option ? 'bg-teal-100 border-teal-600' : 'border-gray-300'
                        }`}
                        onClick={() => handleMultipleChoiceAnswer(currentQuestion.id, option)}
                      >
                        <span
                          className={`w-8 h-8 flex items-center justify-center rounded-full mr-3 font-semibold ${
                            answers[currentQuestion.id] === option ? 'bg-teal-600 text-white' : 'bg-gray-200'
                          }`}
                        >
                          {String.fromCharCode(97 + index)}
                        </span>
                        <span>{option}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="w-full p-4 border border-gray-300 rounded-lg min-h-[150px] focus:outline-none focus:ring-2 focus:ring-teal-600"
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, null, e.target.value, e)}
                    placeholder="Type your answer here..."
                  />
                )}
                <div className="flex justify-between mt-4">
                  <button
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"
                    onClick={handleSaveAnswer}
                  >
                    Save Answer
                  </button>
                  <div>
                    <button
                      className="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg mr-2 hover:bg-gray-400"
                      onClick={() => handleQuestionNavigation(currentQuestionIndex - 1)}
                      disabled={currentQuestionIndex === 0}
                    >
                      Previous
                    </button>
                    <button
                      className="bg-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-400"
                      onClick={() => handleQuestionNavigation(currentQuestionIndex + 1)}
                      disabled={currentQuestionIndex === flatQuestions.length - 1}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">No question selected or available.</div>
          )}
        </div>
        {renderCameraContainer()}
      </div>
    </div>
  );
};

export default ExamPage;