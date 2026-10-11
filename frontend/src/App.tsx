import { calculate } from './api/client'
import { Calculator } from './components/Calculator'

function App() {
  return (
    <main className="app">
      <h1 className="visually-hidden">Calculator</h1>
      <Calculator calculate={calculate} />
      <p className="app-footer">Every calculation is evaluated by the Go API.</p>
    </main>
  )
}

export default App
