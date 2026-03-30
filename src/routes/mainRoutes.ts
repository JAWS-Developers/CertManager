import { ElementType } from "react"
import { HomePageScreen } from "../screens/home/HomePageScreen"

type Routes = {
    path: string,
    title: string,
    element: ElementType
    onNav?: boolean,
    link: string,
}[]

export const MainRoutes: Routes = [
    {
        path: "/home",
        title: "Home",
        element: HomePageScreen,
        onNav: true,
        link: "/"
    },
]