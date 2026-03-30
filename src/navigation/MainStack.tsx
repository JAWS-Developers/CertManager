import { createElement, FC } from 'react'
import { Route, Routes } from 'react-router-dom'
import { MainRoutes } from '../routes/mainRoutes'
import { HomePageScreen } from '../screens/home/HomePageScreen'

export const MainStack: FC = () => {
    return (
        <Routes>
            <Route path='/' element={<HomePageScreen />} />
            {
                MainRoutes.map(route => (
                    <Route key={route.path} path={route.path} element={createElement(route.element)} />
                ))
            }
        </Routes>
    )
}