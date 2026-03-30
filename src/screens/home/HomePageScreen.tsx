import { useNotification } from "../../contexts/NotificationContext";
import "./HomePageScreen.css"
import { FC, useEffect, useState } from "react";


export const HomePageScreen: FC = () => {
    const { notify } = useNotification();

    notify("test", "error");

    return (
        <>
            ciao
        </>
    )
}