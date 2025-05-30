import React from 'react';
import { ExamData } from './ExamPage';
import logo from '../images/logo.png'; // Import the logo

// Props type definition
interface ExamInstructionsProps {
  examData: ExamData;
  registrationNumber: string;
  setRegistrationNumber: React.Dispatch<React.SetStateAction<string>>;
  regNumberError: string | null;
  setRegNumberError: React.Dispatch<React.SetStateAction<string | null>>;
  handleStartExam: () => Promise<void>;
}

const ExamInstructions: React.FC<ExamInstructionsProps> = ({
  examData,
  registrationNumber,
  setRegistrationNumber,
  regNumberError,
  setRegNumberError,
  handleStartExam,
}) => {
  // Log received data for debugging
  console.log('ExamInstructions received examData:', JSON.stringify(examData, null, 2));

  // Extract dynamic data from examData.instructions
  const instituteName = examData.instructions?.title || 'Institute Of Public Health And Management (IPHM)';
  
  // Initialize variables for exam details
  let courseCode = '';
  let examDate = '';
  let timeAllowed = '';
  let academicYear = '';
  let instructionsContent: string[] = [];

  // Extract exam details from instructions.content
  if (examData.instructions?.content && examData.instructions.content.length > 0) {
    examData.instructions.content.forEach((line: string) => {
      if (line.includes('MPH') || line.includes(':')) {
        // Assuming lines with colons or 'MPH' indicate course code
        if (!courseCode && line.includes(':')) {
          courseCode = line;
        }
      }
      if (line.includes('Exam Date:')) {
        examDate = line.replace('Exam Date:', '').trim();
      }
      if (line.includes('Time Allowed:')) {
        // Capture the next line as well if it contains the actual time
        timeAllowed = line.replace('Time Allowed:', '').trim();
      }
      if (line.includes('hours')) {
        // If timeAllowed was just "Time Allowed:", append the hours line
        if (!timeAllowed.includes('hours')) {
          timeAllowed = timeAllowed ? `${timeAllowed} ${line}` : line;
        }
      }
      if (line.includes('Academic Year:')) {
        academicYear = line.replace('Academic Year:', '').trim();
      }
    });

    // Filter out the lines used for metadata to get the actual instructions
    instructionsContent = examData.instructions.content.filter((line: string) =>
      !line.includes('Exam Date:') &&
      !line.includes('Time Allowed:') &&
      !line.includes('hours') &&
      !line.includes('Academic Year:') &&
      !line.includes('MPH') &&
      !line.includes('Student Registration Number:') &&
      !line.includes('©')
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-white font-serif overflow-hidden">
      <div className="max-w-2xl w-full mx-2 bg-white border border-gray-200 rounded-lg shadow-md">
        <div className="p-2">
          {/* Header with Logo and Branding */}
          <div className="text-center mb-2">
            <div className="flex items-center justify-center mb-1">
              <img
                src={logo}
                alt="Clarke International University Logo"
                className="w-14 h-14 object-contain mr-2"
                onError={() => console.log('Logo failed to load')}
              />
              <div className="text-left">
                <h1 className="text-3xl font-bold text-teal-700 tracking-wide">CLARKE</h1>
                <h2 className="text-base font-semibold text-teal-700 tracking-wide">INTERNATIONAL UNIVERSITY</h2>
                <p className="text-xs text-teal-700">LEAD • INNOVATE • TRANSFORM</p>
              </div>
            </div>
          </div>

          {/* Institute Information */}
          <div className="text-center mb-2">
            <h3 className="text-base font-bold text-black">{instituteName}</h3>
          </div>

          {/* Exam Details in Specified Order */}
          <div className="text-center mb-2 space-y-0.5">
            {courseCode && <p className="text-base font-bold text-black">{courseCode}</p>}
            {academicYear && <p className="text-sm text-black font-semibold">Academic Year: {academicYear}</p>}
            {examDate && <p className="text-sm text-black font-semibold">Exam Date: {examDate}</p>}
            {timeAllowed && <p className="text-base font-bold text-black">Time Allowed: {timeAllowed}</p>}
          </div>

          {/* Registration Number Input */}
          <div className="text-center mb-2">
            <div className="flex items-center justify-center">
              <label htmlFor="registrationNumber" className="text-sm font-semibold text-black mr-1">
                Student Registration Number:
              </label>
              <div className="border-b-2 border-black" style={{ width: '250px' }}>
                <input
                  type="text"
                  id="registrationNumber"
                  value={registrationNumber}
                  onChange={(e) => {
                    setRegistrationNumber(e.target.value);
                    setRegNumberError(null);
                  }}
                  className="w-full p-1 bg-transparent text-center focus:outline-none text-sm"
                  placeholder=""
                />
              </div>
            </div>
            {regNumberError && <div className="text-red-500 text-xs mt-1">{regNumberError}</div>}
          </div>

          {/* Instructions to Candidates */}
          <div className="text-center mb-2">
            <h3 className="text-base font-bold text-black mb-1">INSTRUCTIONS TO CANDIDATES</h3>
            {instructionsContent.length > 0 && (
              <ul className="list-none text-black space-y-1">
                {instructionsContent.map((instruction, i) => (
                  <li key={i} className="text-sm">{instruction}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Start Exam Button - Moved to the Last */}
          <div className="text-center mt-2">
            <button
              onClick={handleStartExam}
              className="bg-teal-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-teal-700 transition text-sm"
            >
              Start Exam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamInstructions;