import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { BiSolidUserRectangle } from "react-icons/bi";
import { FaLock } from "react-icons/fa";
import axios from "axios";

export default function StudentLogin(): JSX.Element {
  const navigate = useNavigate();

  const [regNo, setRegNo] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!regNo.trim() || !academicYear.trim() || !semester.trim()) {
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const apiUrl = `https://eadmin.ciu.ac.ug/API/ClearedStudentsAPI.aspx?acad=${academicYear}&sem=${semester}`;

    try {
      const response = await axios.get(apiUrl, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      let clearedStudents;
      if (typeof response.data === "string") {
        try {
          clearedStudents = JSON.parse(response.data);
        } catch (parseError) {
          throw new Error("Unable to parse server response.");
        }
      } else {
        clearedStudents = response.data;
      }

      if (!Array.isArray(clearedStudents)) {
        throw new Error("Invalid data format received from the server.");
      }

      const studentCleared = clearedStudents.some((student: any) => {
        const studentRegNo = student?.RegistrationNo?.trim().toLowerCase();
        return studentRegNo === regNo.trim().toLowerCase();
      });

      if (studentCleared) {
        setSuccessMessage("Login successful!");
        localStorage.setItem("studentRegNo", regNo.trim());
        localStorage.setItem("studentYear", academicYear.trim());
        localStorage.setItem("studentSem", semester.trim());
        // Fetch cleared students and store extra details for the logged-in student
        try {
          const clearedRes = await axios.get(
            `https://eadmin.ciu.ac.ug/API/ClearedStudentsAPI.aspx?acad=${academicYear}&sem=${semester}`
          );
          let clearedStudents = clearedRes.data;
          if (typeof clearedStudents === "string") {
            try { clearedStudents = JSON.parse(clearedStudents); } catch { clearedStudents = []; }
          }
          const matchedStudent = clearedStudents.find(
            (student: any) => student.RegistrationNo?.trim().toLowerCase() === regNo.trim().toLowerCase()
          );
          if (matchedStudent) {
            localStorage.setItem("StudyYear", matchedStudent.StudyYear || "");
            localStorage.setItem("Semester", matchedStudent.Semester || "");
            localStorage.setItem("AcademicYear", matchedStudent.AcademicYear || "");
            localStorage.setItem("StudentName", matchedStudent.StudentName || "");
          }
        } catch (error) {
          console.error("API Error fetching cleared students:", error);
        }
        setTimeout(() => {
          navigate("/", {
            state: {
              regNo: regNo.trim(),
              academicYear: academicYear.trim(),
              semester: semester.trim(),
            },
          });
        }, 1000);
      } else {
        setErrorMessage("Registration number not found or not cleared.");
      }
    } catch (err: any) {
      console.error("Login error:", err);

      if (err.response) {
        setErrorMessage(
          `Server Error: ${err.response.status} - ${err.response.statusText}`
        );
      } else if (err.message.includes("Network Error")) {
        setErrorMessage(
          "Network error: Please check your internet connection."
        );
      } else {
        setErrorMessage(err.message || "Unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="font-['Roboto'] flex justify-center items-center min-h-screen bg-[#ebebeb] py-5">
      <div className="relative w-[420px] h-[620px] bg-white text-[#106053]">
        <div className="grid place-items-center w-full h-[185px] bg-[#106053] text-white">
          <h1 className="text-[30px] text-center">ONLINE EXAMINATION SYSTEM</h1>
        </div>

        <div className="w-full p-10">
          <form onSubmit={handleSubmit}>
            <div className="flex justify-center mb-6">
              <div className="h-[40px] w-[40px] bg-white rounded-[10px] flex items-center justify-center">
                <BiSolidUserRectangle className="text-[#106053]" size={42} />
              </div>
            </div>

            <div className="mb-4">
              <input
                type="text"
                required
                placeholder="Registration Number (e.g., 2023BBAFT-A10)"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                className="w-full h-[50px] bg-[#ebebeb] rounded-[40px] px-[20px] text-black placeholder:text-[#4f4e4e]"
              />
            </div>

            <div className="mb-4">
              <input
                type="text"
                required
                placeholder="Academic Year (e.g., 2024/2025)"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full h-[50px] bg-[#ebebeb] rounded-[40px] px-[20px] text-black placeholder:text-[#4f4e4e]"
              />
            </div>

            <div className="mb-4">
              <input
                type="number"
                required
                placeholder="Semester (e.g., 2)"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                min="1"
                max="3"
                className="w-full h-[50px] bg-[#ebebeb] rounded-[40px] px-[20px] text-black placeholder:text-[#4f4e4e]"
              />
            </div>

            <div className="relative w-full h-[50px] bg-[#ebebeb] mb-8">
              <input
                type="password"
                placeholder="Password (optional)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-full bg-transparent border-none outline-none border-[2px] border-white/10 rounded-[40px] text-[16px] text-black px-[20px] pr-[45px] placeholder:text-[#4f4e4e]"
              />
              <FaLock className="absolute right-5 top-1/2 -translate-y-1/2 text-[16px]" />
            </div>

            <div className="text-[14.5px] mb-4">
              <label>
                <input type="checkbox" className="accent-white mr-1" /> Remember Me
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-[45px] bg-[#106053] text-white border-none outline-none cursor-pointer text-[16px] font-bold hover:bg-[#0b3f37] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Logging in..." : "LOGIN"}
            </button>

            {errorMessage && (
              <p className="text-red-600 font-bold mt-2 text-center text-sm">
                {errorMessage}
              </p>
            )}
            {successMessage && (
              <p className="text-green-600 font-bold mt-2 text-center text-sm">
                {successMessage}
              </p>
            )}

            <div className="mt-5 mb-4 text-[14.5px] text-center">
              <Link to="/reset-password" className="text-[#106053] hover:underline">
                Forgot Password?
              </Link>
              <span> or </span>
              <Link to="/studenttoken-password-reset" className="text-[#106053] hover:underline">
                Set password using token
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
