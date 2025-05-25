## Prerequisites
- Node.js (v14 or higher)
- npm (v6 or higher) or yarn
- PostgreSQL (v12 or higher)
- Deepgram API Key (for speech-to-text)
- Google Gemini API Key (for SOAP report generation)

## Environment Setup

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the backend directory with the following variables:
   ```env
   PORT=3333
   DATABASE_URL="postgresql://your_username:your_password@localhost:5432/asha-health?schema=public"
   DEEPGRAM_API_KEY=your_deepgram_api_key
   GEMINI_API_KEY=your_gemini_api_key
   NODE_ENV=development
   ```

4. Run database migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the frontend directory:
   ```env
   REACT_APP_API_URL=http://localhost:3333
   ```

## Running the Application

### Start the Backend

1. In the backend directory, run:
   ```bash
   npm run start:dev
   ```
   The backend will be available at `http://localhost:3333`

### Start the Frontend

1. In a new terminal, navigate to the frontend directory and run:
   ```bash
   npm start
   ```
   The frontend will open automatically in your default browser at `http://localhost:3000`
