import "./HomePageScreen.css"
import { FC, useState } from "react";


type CertConfig = {
    separateFiles: boolean;
    pemPath: string;
    certPath: string;
    caPath: string;
    keyPath: string;
};

export const HomePageScreen: FC = () => {
    const [config, setConfig] = useState<CertConfig>({
        separateFiles: false,
        pemPath: "",
        certPath: "",
        caPath: "",
        keyPath: "",
    });

    const updateConfig = (field: keyof CertConfig, value: string | boolean) =>
        setConfig(prev => ({ ...prev, [field]: value }));

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
                        checked={config.separateFiles}
                        onChange={e => updateConfig("separateFiles", e.target.checked)}
                        className="cert-toggle-checkbox"
                    />
                    <span>Usa file separati (cert, CA, key)</span>
                </label>

                {!config.separateFiles ? (
                    <div className="cert-form-group">
                        <label htmlFor="pem-path">File PEM</label>
                        <input
                            id="pem-path"
                            type="text"
                            placeholder="/path/to/certificate.pem"
                            value={config.pemPath}
                            onChange={e => updateConfig("pemPath", e.target.value)}
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
                                value={config.certPath}
                                onChange={e => updateConfig("certPath", e.target.value)}
                                className="cert-form-input"
                            />
                        </div>
                        <div className="cert-form-group">
                            <label htmlFor="ca-path">CA (Certificate Authority)</label>
                            <input
                                id="ca-path"
                                type="text"
                                placeholder="/path/to/ca.crt"
                                value={config.caPath}
                                onChange={e => updateConfig("caPath", e.target.value)}
                                className="cert-form-input"
                            />
                        </div>
                        <div className="cert-form-group">
                            <label htmlFor="key-path">Chiave privata</label>
                            <input
                                id="key-path"
                                type="text"
                                placeholder="/path/to/private.key"
                                value={config.keyPath}
                                onChange={e => updateConfig("keyPath", e.target.value)}
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