import { ElementType } from "react"
import { HomePageScreen } from "../screens/home/HomePageScreen"
import { ServicesListScreen } from "../screens/services/ServicesListScreen"
import { ServiceDetailScreen } from "../screens/services/ServiceDetailScreen"
import { ServiceFormScreen } from "../screens/services/ServiceFormScreen"
import { SettingsScreen } from "../screens/settings/SettingsScreen"

type Routes = {
    path: string,
    title: string,
    element: ElementType
    onNav?: boolean,
    link: string,
}[]

export const MainRoutes: Routes = [
    {
        path: "/",
        title: "Dashboard",
        element: HomePageScreen,
        onNav: true,
        link: "/"
    },
    {
        path: "/services",
        title: "Services",
        element: ServicesListScreen,
        onNav: true,
        link: "/services"
    },
    {
        path: "/services/new",
        title: "New Service",
        element: ServiceFormScreen,
        link: "/services/new"
    },
    {
        path: "/services/:id",
        title: "Service Detail",
        element: ServiceDetailScreen,
        link: "/services"
    },
    {
        path: "/services/:id/edit",
        title: "Edit Service",
        element: ServiceFormScreen,
        link: "/services"
    },
    {
        path: "/settings",
        title: "Settings",
        element: SettingsScreen,
        onNav: true,
        link: "/settings"
    },
]