# AI Adaptive Assistant

...Project Plan: Adaptive AI Teacher (v2 - User-Upload Model)



This plan is adapted from our original idea to follow the new, more powerful workflow where the student provides their own learning material.



Phase 1: Core Application \& Authentication (COMPLETE)



Goal: Build the skeleton of the app.



Tasks:



Setup React app with lucide-react.



Setup Firebase (Config, Auth, Firestore).



Create Login Page.



Create Register Page (with "Student" / "Teacher" roles).



Logic to show correct dashboard based on role.



Phase 2: Dashboards \& Database (COMPLETE)



Goal: Make the dashboards functional and connect them to the database.



Tasks:



Teacher Dashboard: Fetch and display a live list of all registered "student" users from the public user\_roles collection in Firestore.



Student Dashboard: Create the tabbed navigation (My Library, AI Tools, Paced Reader, AI Chatbot).



Phase 3: Student PDF Upload \& Paced Reader (COMPLETE)



Goal: Allow a student to upload a PDF, extract the text, and read it with a paced reader.



Tasks:



StudentLibrary Component:



Create a file upload button.



When a PDF is uploaded, send it to the Gemini API for text extraction.



Save the extracted text to the student's private Firestore collection (/users/{userId}/documents).



Display a list of all uploaded documents.



PacedReader Component:



When a user clicks "Read," open this component.



Display the document text.



Create "Play/Pause" and "Reset" buttons.



Implement word-by-word highlighting logic.



Add a slider to control the playback speed (WPM).



Add a Text-to-Speech (TTS) button for the current line.



Phase 4: AI Core Features (COMPLETE)



Goal: Integrate Gemini API for AI-driven learning aids.



Tasks:



AITools Component:



Add a dropdown to select an uploaded document.



Add a "Generate Quiz" button.



Call Gemini API with the document text, asking for a JSON-formatted quiz.



QuizGame Component:



Create a new component to display the gamified quiz from the AI.



PacedReader (Update):



Add ability to click a single word.



Add a "Simplify Word" button that calls Gemini API.



Add Translation buttons (Hindi, Tamil) that call Gemini API.



Show AI responses in a modal.



Phase 5: Teacher - Upload \& View Progress (NOT STARTED)



Goal: Allow teachers to upload content and see student progress.



Tasks:



Teacher Dashboard (Update):



Add a file upload feature for teachers (similar to the student's).



Make uploaded teacher documents visible to all students.



Show student's quiz scores and completed modules.



Phase 6: AI Chatbot (COMPLETE)



Goal: Add a conversational AI assistant.



Tasks:



Create AIChatbot Component.



Add a chat interface.



Add a dropdown to select a document for context.



Call Gemini API with the user's question, including document context if provided (RAG).



Phase 7: Eye-Tracking Reader (NOT STARTED)



Goal: Implement the advanced eye-tracking feature.



Tasks:



Create a new EyeTrackReader tab/component.



Add webgazer.js library.



Calibrate the eye-tracker.



Implement logic to advance text/highlight based on gaze position.



Add soft alerts for focus loss.

