import "./HomePageScreen.css"
import { FC, useState } from "react";


export const HomePageScreen: FC = () => {
    const [separateFiles, setSeparateFiles] = useState(false);
    const [pemPath, setPemPath] = useState("");
    const [certPath, setCertPath] = useState("");
    const [caPath, setCaPath] = useState("");
    const [keyPath, setKeyPath] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
    };

    return (
        <div className="cert-form-container">
            <h2 className="cert-form-title">Configurazione Certificato</h2>
            <form className="cert-form" onSubmit={handleSubmit}>

                <label className="cert-toggle-label">
                    <input
                        type="checkbox"
                        checked={separateFiles}
                        onChange={e => setSeparateFiles(e.target.checked)}
                        className="cert-toggle-checkbox"
                    />
                    <span>Usa file separati (cert, CA, key)</span>
                </label>

                {!separateFiles ? (
                    <div className="cert-form-group">
                        <label htmlFor="pem-path">File PEM</label>
                        <input
                            id="pem-path"
                            type="text"
                            placeholder="/path/to/certificate.pem"
                            value={pemPath}
                            onChange={e => setPemPath(e.target.value)}
                            className="cert-form-input"
                        />
                    </div>
                ) : (
                    <>
                        <div className="cert-form-group">
                            <label htmlFor="cert-path">Certificato</label>
                            <input
                                id="cert-path"
                                type="text"
                                placeholder="/path/to/cert.crt"
                                value={certPath}
                                onChange={e => setCertPath(e.target.value)}
                                className="cert-form-input"
                            />
                        </div>
                        <div className="cert-form-group">
                            <label htmlFor="ca-path">CA (Certificate Authority)</label>
                            <input
                                id="ca-path"
                                type="text"
                                placeholder="/path/to/ca.crt"
                                value={caPath}
                                onChange={e => setCaPath(e.target.value)}
                                className="cert-form-input"
                            />
                        </div>
                        <div className="cert-form-group">
                            <label htmlFor="key-path">Chiave privata</label>
                            <input
                                id="key-path"
                                type="text"
                                placeholder="/path/to/private.key"
                                value={keyPath}
                                onChange={e => setKeyPath(e.target.value)}
                                className="cert-form-input"
                            />
                        </div>
                    </>
                )}

                <button type="submit" className="cert-form-submit">Salva</button>
            </form>
        </div>
    );
}