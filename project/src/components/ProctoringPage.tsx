import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TbDeviceComputerCamera } from "react-icons/tb";
import { IoExitOutline } from "react-icons/io5";
import * as faceapi from "face-api.js";

const ProctoringPage: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioStream = useRef<MediaStream | null>(null);

  const [videoEnabled, setVideoEnabled] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [beginExamEnabled, setBeginExamEnabled] = useState<boolean>(false);
  const [flagCount, setFlagCount] = useState<number>(0);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);

  const examId = "exam-id-placeholder"; // Replace dynamically later

  const handleWebcamToggle = async () => {
    if (!videoEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setVideoEnabled(true);
      } catch (error) {
        alert("Please allow webcam access to continue.");
      }
    } else {
      stopWebcam();
      setVideoEnabled(false);
      alert("Webcam turned off. Redirecting...");
    }
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
  };

  const handleMicrophoneToggle = async () => {
    if (!audioEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.current = stream;
        setAudioEnabled(true);
      } catch (error) {
        alert("Please allow microphone access to continue.");
      }
    } else {
      stopMicrophone();
      setAudioEnabled(false);
      alert("Microphone turned off. Redirecting...");
    }
  };

  const stopMicrophone = () => {
    if (audioStream.current) {
      audioStream.current.getTracks().forEach((track) => track.stop());
    }
  };

  useEffect(() => {
    setBeginExamEnabled(videoEnabled && audioEnabled);
  }, [videoEnabled, audioEnabled]);

  useEffect(() => {
    const disableContextMenu = (e: Event) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        ["Tab", "F11", "F12", "r", "R", "t", "T"].includes(e.key)
      ) {
        e.preventDefault();
        alert("Keyboard shortcuts are disabled during the exam.");
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flagStudent();
      }
    };
    const handleBlur = () => {
      flagStudent();
    };

    document.addEventListener("contextmenu", disableContextMenu);
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("contextmenu", disableContextMenu);
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const flagStudent = () => {
    setFlagCount((prev) => {
      const newCount = prev + 1;
      if (newCount >= 3) {
        autoSubmitExam();
      }
      sendFlagToServer();
      return newCount;
    });
  };

  const autoSubmitExam = () => {
    alert("You have been flagged 3 times. Submitting exam.");
    // navigate("/student");
  };

  const sendFlagToServer = async () => {
    await fetch("/api/flags", { method: "POST" });
  };

  useEffect(() => {
    if (videoEnabled && audioEnabled) {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      }
    }
  }, [videoEnabled, audioEnabled]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getVideoTracks();
        if (tracks.length === 0 || tracks[0].readyState !== "live") {
          alert("Webcam has been disabled. Redirecting...");
          // navigate("/student");
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [videoEnabled]);

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models";
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      setModelLoaded(true);
    };
    loadModels();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (videoEnabled && modelLoaded && videoRef.current) {
        const result = await faceapi.detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions()
        );
        if (!result) {
          flagStudent();
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [videoEnabled, modelLoaded]);

  const handleBeginExam = () => {
    if (beginExamEnabled) {
      const examLink = localStorage.getItem("currentExamLink");
      if (examLink) {
        // Extract ExamNo from the link
        const match = examLink.match(/ExamNo=(\d+)/);
        if (match && match[1]) {
          const examNo = match[1];
          localStorage.setItem("currentExamNo", examNo);
          localStorage.setItem("currentExamFullLink", examLink);
          navigate("/home"); // Go to Home
        } else {
          alert("Invalid exam link format. Cannot extract ExamNo.");
        }
      } else {
        alert("No exam link found. Please start from the exam list.");
      }
    } else {
      alert("Please ensure all conditions are met before starting the exam.");
    }
  };

  return (
    <div className="flex justify-center  items-center h-screen bg-gray-100 px-4">
      <div className="w-full max-w-xl bg-white shadow-xl rounded-lg p-6">
        <h1 className="text-center text-2xl font-bold mb-4">PROCTORING WINDOW</h1>

        <div
          className={`w-full h-64 mb-4 rounded-md flex items-center justify-center ${
            videoEnabled ? "bg-white" : "bg-gray-300"
          }`}
        >
          {!videoEnabled && (
            <TbDeviceComputerCamera className="text-gray-500 text-6xl" />
          )}
          <video
            ref={videoRef}
            autoPlay
            className={`w-full h-full object-cover rounded ${videoEnabled ? "block" : "hidden"}`}
          />
        </div>

        <p className="text-center font-semibold text-red-600 mb-2">
          Flags: {flagCount}
        </p>

        <div className="flex flex-col gap-4 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={videoEnabled}
              onChange={handleWebcamToggle}
            />
            <span>Allow webcam access</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={handleMicrophoneToggle}
            />
            <span>Allow microphone access</span>
          </label>
        </div>

        <div className="flex justify-between items-center mt-6">
          <button
            onClick={handleBeginExam}
            disabled={!beginExamEnabled}
            className={`px-6 py-2 rounded font-bold transition ${
              beginExamEnabled
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-300 text-gray-600 cursor-not-allowed"
            }`}
          >
            BEGIN EXAM
          </button>

          <button
            // onClick={() => navigate("/student")}
            className="flex items-center gap-2 text-red-600 hover:text-red-800 transition"
          >
            <IoExitOutline className="text-xl" />
            Exit
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProctoringPage;
