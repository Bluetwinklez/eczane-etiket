const Api = (function () {
  async function request(method, url, body) {
    const opts = {
      method,
      headers: {},
      credentials: 'same-origin'
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);

    if (res.status === 401) {
      if (!location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
      }
      throw new Error('Oturum sona erdi');
    }

    if (res.status === 204) return null;

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const message = (data && data.error) || 'Bir hata olustu';
      throw new Error(message);
    }
    return data;
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    downloadUrl: (url) => url
  };
})();
