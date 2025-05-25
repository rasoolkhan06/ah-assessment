import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [status, setStatus] = useState('');
  const [transcript, setTranscript] = useState('');
  const [soapReport, setSoapReport] = useState('');
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const API_BASE_URL = 'http://localhost:3333'; // Update with your backend URL

  // Request access to the microphone
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        
        // Send the audio to the backend
        await sendAudioToBackend(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setStatus('Recording...');
      setTranscript('');
      setSoapReport('');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setStatus('Error accessing microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setStatus('Processing audio...');
    }
  };

  const sendAudioToBackend = async (audioBlob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    try {
      const response = await axios.post(`${API_BASE_URL}/transcription/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setStatus('Transcription completed');
      if (response.data.transcript) {
        setTranscript(response.data.transcript);
      }
      if (response.data.soapReport) {
        setSoapReport(response.data.soapReport);
      }
    } catch (error) {
      console.error('Error sending audio to backend:', error);
      setStatus('Error processing audio');
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorder.current) {
        mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Medical Audio Transcription</h1>
        
        <div className="recording-controls">
          {!isRecording ? (
            <button onClick={startRecording} className="record-button">
              Start Recording
            </button>
          ) : (
            <button onClick={stopRecording} className="stop-button">
              Stop Recording
            </button>
          )}
          <p className="status">{status}</p>
        </div>

        {audioURL && (
          <div className="audio-player">
            <audio src={audioURL} controls />
          </div>
        )}

        {transcript && (
          <div className="transcript">
            <h3>Transcript:</h3>
            <p>{transcript}</p>
          </div>
        )}

        {soapReport && (
          <div className="soap-report">
            <h3>SOAP Report:</h3>
            <pre>{soapReport}</pre>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
