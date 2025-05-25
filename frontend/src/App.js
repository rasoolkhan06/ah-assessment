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

  const [reportId, setReportId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Poll for report updates
  useEffect(() => {
    if (!reportId || !isProcessing) return;

    const checkReportStatus = async () => {
      try {
        console.log('Checking report status for ID:', reportId);
        const response = await axios({
          method: 'get',
          url: `${API_BASE_URL}/transcription/report/${reportId}`,
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          },
          timeout: 10000, // 10 seconds timeout
          withCredentials: true
        });
        
        console.log('Report status response:', response);
        
        // Handle different response formats
        const reportData = response.data.data || response.data;
        
        if (!reportData) {
          throw new Error('No data in response');
        }
        
        const status = reportData.status || 'unknown';
        setStatus(status.replace('_', ' '));
        
        if (reportData.transcript) {
          setTranscript(reportData.transcript);
        }
        
        if (reportData.soapReport) {
          setSoapReport(reportData.soapReport);
        }
        
        // Handle different statuses
        if (status === 'completed') {
          setStatus('Transcription completed');
          setIsProcessing(false);
        } else if (status === 'completed_with_errors') {
          setStatus('Completed with errors');
          setIsProcessing(false);
        } else if (status === 'failed') {
          setStatus('Transcription failed');
          setIsProcessing(false);
        } else if (status === 'in_progress') {
          setStatus('Processing audio...');
        }
      } catch (error) {
        console.error('Error checking report status:', error);
        setStatus('Error checking status');
        setIsProcessing(false);
      }
    };

    // Poll every 2 seconds
    const intervalId = setInterval(checkReportStatus, 2000);
    
    // Initial check
    checkReportStatus();
    
    // Cleanup interval on unmount or when report is complete
    return () => clearInterval(intervalId);
  }, [reportId, isProcessing]);

  const sendAudioToBackend = async (audioBlob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    try {
      setStatus('Uploading audio...');
      console.log('Sending request to:', `${API_BASE_URL}/transcription/upload`);
      
      const response = await axios({
        method: 'post',
        url: `${API_BASE_URL}/transcription/upload`,
        data: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
          'Accept': 'application/json'
        },
        timeout: 30000, // 30 seconds timeout
        withCredentials: true, // Include credentials (cookies, HTTP authentication)
      });

      console.log('Upload response:', response);
      
      if (response && response.data && response.data.id) {
        setReportId(response.data.id);
        setIsProcessing(true);
        setStatus('Processing audio...');
      } else {
        console.error('Unexpected response format:', response);
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error sending audio to backend:', error);
      const errorMessage = error.response?.data?.message || 
                         error.message || 
                         'Error processing audio';
      setStatus(errorMessage);
      setIsProcessing(false);
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
            <button 
              onClick={startRecording} 
              className={`record-button ${isProcessing ? 'disabled' : ''}`}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Start Recording'}
            </button>
          ) : (
            <button 
              onClick={stopRecording} 
              className={`stop-button ${isProcessing ? 'disabled' : ''}`}
              disabled={isProcessing}
            >
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
