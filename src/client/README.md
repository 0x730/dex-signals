# Token Monitor React Client

This is the React client for the Token Monitor application. It provides a modern, responsive user interface for interacting with the Token Monitor API.

## Features

- View and filter tokens across multiple blockchains
- View detailed token information
- Track paper trading signals
- Responsive design for desktop and mobile

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

The client can be installed and built as part of the main application:

```bash
# From the project root
npm run client-install
```

### Development

To run the client in development mode:

```bash
# From the project root
npm run client-dev
```

This will start the React development server on port 3001 with hot reloading enabled. The development server will proxy API requests to the main server running on port 3000.

### Building for Production

To build the client for production:

```bash
# From the project root
npm run client-build
```

This will create a production build in the `build` directory, which will be served by the main Express server.

## Project Structure

- `public/`: Static files and HTML template
- `src/`: Source code
  - `components/`: Reusable UI components
  - `pages/`: Page components
  - `App.js`: Main application component
  - `index.js`: Entry point

## Available Scripts

In the client directory, you can run:

- `npm start`: Runs the app in development mode
- `npm test`: Launches the test runner
- `npm run build`: Builds the app for production
- `npm run eject`: Ejects from Create React App (not recommended)

## Technologies Used

- React
- React Router
- Axios
- Bootstrap
- Font Awesome
