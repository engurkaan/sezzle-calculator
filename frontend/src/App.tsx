import { api } from './api/client'
import { Calculator } from './components/Calculator'

function App() {
  return (
    <main className="app">
      <h1 className="visually-hidden">Calculator</h1>
      <Calculator api={api} />
    </main>
  )
}

export default App
