// ExamInterface.tsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

interface Exam {
  courseName: string;
  regno: string;
  courseID: string;
  acad_year: string;
  semester: number;
  course_status: string;
  prog_id: string;
  stud_session: string;
  ExamLink: string;
  StartTime: string;
  EndTime: string;
  ExamDate: string;
}

const ExamInterface: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const regNo = localStorage.getItem("studentRegNo");
    const year = localStorage.getItem("StudyYear"); // ✅ Now available
    const sem = localStorage.getItem("studentSem");

    console.log("RegNo:", regNo);
    console.log("StudyYear:", year);
    console.log("Semester:", sem);

    if (!regNo || !year || !sem) {
      setError("Missing login info. Please log in again.");
      setLoading(false);
      return;
    }

    const apiUrl = `https://eadmin.ciu.ac.ug/API/StudentExamsAPI.aspx?reg=${regNo}&yr=${year}&sem=${sem}`;

    axios
      .get(apiUrl)
      .then((res) => {
        let data = res.data;

        // Clean malformed API response
        if (typeof data === "string") {
          data = data.replace(/^\uFEFF/, "").trim();
          try {
            data = JSON.parse(data);
          } catch (err) {
            console.error("Failed to parse exam data:", err);
            data = [];
          }
        }

        if (!Array.isArray(data)) {
          setExams([]);
        } else {
          // Do not filter by course_status, show all exams returned by the API
          setExams(data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch exams:", err);
        setError("Unable to load exams. Please try again later.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleStartExam = (exam: Exam) => {
    // Save exam info for proctoring
    localStorage.setItem("currentExamLink", exam.ExamLink);
    localStorage.setItem("currentExamName", exam.courseName);
    localStorage.setItem("currentExamID", exam.courseID);
    // Extract examNo from ExamLink if present
    let examNo = '';
    if (exam.ExamLink) {
      const match = exam.ExamLink.match(/ExamNo=([\w-]+)/);
      if (match) {
        examNo = match[1];
        localStorage.setItem("currentExamNo", examNo);
      }
    }
    // Add more fields if needed
    navigate("/proctoring");
  };

  return (
    <div className="max-w-4xl mx-auto mt-24 bg-white rounded-xl shadow-lg overflow-hidden">
      <h2 className="text-[1.8rem] font-semibold mb-6 text-center text-[#106053]">
        Your Exams
      </h2>

      {loading ? (
        <div className="text-center py-10">Loading exams...</div>
      ) : error ? (
        <div className="text-center text-red-600 py-10">{error}</div>
      ) : exams.length === 0 ? (
        <div className="text-center py-10">No cleared exams found.</div>
      ) : (
        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full border-collapse">
            <thead className="bg-[#106053] text-white sticky top-0 z-10">
              <tr>
                <th className="py-4 px-6 text-left">Exam Name</th>
                <th className="py-4 px-6 text-left">Course ID</th>
                <th className="py-4 px-6 text-left">Status</th>
                <th className="py-4 px-6 text-left">Date</th>
                <th className="py-4 px-6 text-left">Start</th>
                <th className="py-4 px-6 text-left">End</th>
                <th className="py-4 px-6 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam, index) => (
                <tr key={index} className="hover:bg-gray-100 transition-colors">
                  <td className="py-4 px-6 border-b">{exam.courseName}</td>
                  <td className="py-4 px-6 border-b">{exam.courseID}</td>
                  <td className="py-4 px-6 border-b">{exam.course_status}</td>
                  <td className="py-4 px-6 border-b">{exam.ExamDate}</td>
                  <td className="py-4 px-6 border-b">{exam.StartTime}</td>
                  <td className="py-4 px-6 border-b">{exam.EndTime}</td>
                  <td className="py-4 px-6 border-b">
                    <button
                      onClick={() => handleStartExam(exam)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                    >
                      Start Exam
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExamInterface;
