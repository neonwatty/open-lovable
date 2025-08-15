import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome to {{projectName}}
          </h1>
          <p className="text-gray-600 mb-6">
            A React app powered by Vite and styled with Tailwind CSS
          </p>
          
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-2">Counter Example:</p>
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={() => setCount((count) => count - 1)}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md transition-colors"
                >
                  -
                </button>
                <span className="text-2xl font-mono font-bold text-gray-900 min-w-[3rem] text-center">
                  {count}
                </span>
                <button
                  onClick={() => setCount((count) => count + 1)}
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors"
                >
                  +
                </button>
              </div>
            </div>
            
            <div className="text-sm text-gray-500">
              <p>Edit <code className="bg-gray-100 px-1 rounded">src/App.jsx</code> to get started</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App