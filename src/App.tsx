import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { MainStack } from './navigation/MainStack'
import { Error404Screen } from './screens/errors/Error404Screen'
import { Error403Screen } from './screens/errors/Error403Screen'

function App() {

    return (
        <BrowserRouter>
            <Routes>
                <Route path='*' element={
                    <>
                        <Routes>
                            <Route path='*' element={<MainStack />} />
                        </Routes>
                    </>
                } />
                <Route path='404' element={<Error404Screen />} />
                <Route path='403' element={<Error403Screen />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App
