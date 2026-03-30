export type APIRequest = {
    auth: { token: string },
    path: string,
    method: 'POST' | 'GET',
    headers_values: { name: string, value: string }[],
    postData?: "{}" | any
}

export type APIResponse = {
    /**
     * Request id for support
     */
    request_id: string

    /**
     * Errore code or exit code
     */
    error_code: string

    /**
     * Request speed
     */
    speed: string

    /**
     * Return data
     */
    data?: any
}
