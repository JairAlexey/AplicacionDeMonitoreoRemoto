import React, { useState } from "react";
import "./index.css";
import JoinEventForm from "./components/JoinEventForm";
import MediaCapture from "./components/MediaCapture";

const App = () => {
  const [eventKey, setEventKey] = useState("");

  const handleExit = () => {
    setEventKey("");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-800 p-6">
      {!eventKey ? (
        <JoinEventForm onJoined={setEventKey} />
      ) : (
        <MediaCapture eventKey={eventKey} onExit={handleExit} />
      )}
    </div>
  );
};

export default App;
