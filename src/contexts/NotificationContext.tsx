import React, { createContext, useContext, ReactNode } from "react";
import { Toaster, toast } from "react-hot-toast";

type NotificationType = "success" | "error" | "info" | "loading";

interface NotificationContextProps {
    notify: (message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const useNotification = (): NotificationContextProps => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error("useNotification deve essere usato dentro NotificationProvider");
    }
    return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const notify = (message: string, type: NotificationType = "info") => {
        switch (type) {
            case "success":
                toast.success(message);
                break;
            case "error":
                toast.error(message);
                break;
            case "loading":
                toast.loading(message);
                break;
            default:
                toast(message);
        }
    };

    return (
        <NotificationContext.Provider value={{ notify }}>
            <Toaster
                position="top-right"
                toastOptions={{
                    style: {
                        background: "#333",
                        color: "#fff",
                        borderRadius: "8px",
                    },
                    success: { iconTheme: { primary: "#4ade80", secondary: "#333" } },
                    error: { iconTheme: { primary: "#f87171", secondary: "#333" } },
                }}
            />
            {children}
        </NotificationContext.Provider>
    );
};