const http = require('http');
const url = require('url');
const querystring = require('querystring');
const port = parseInt(process.env.PORT, 10) | 3000;
const request = require('request');
const normalizeUrl = require('normalize-url');

const renderResult = (result) => `
# HELP probe_dns_lookup_time_seconds Returns the time taken for probe dns lookup in seconds
# TYPE probe_dns_lookup_time_seconds gauge
probe_dns_lookup_time_seconds ${result.lookup}
# HELP probe_duration_seconds Returns how long the probe took to complete in seconds
# TYPE probe_duration_seconds gauge
probe_duration_seconds ${result.duration}
# HELP probe_http_content_length Length of http content response
# TYPE probe_http_content_length gauge
probe_http_content_length ${result.length}
# HELP probe_http_redirects The number of redirects
# TYPE probe_http_redirects gauge
probe_http_redirects ${result.noOfRedirects}
# HELP probe_http_ssl Indicates if SSL was used for the final redirect
# TYPE probe_http_ssl gauge
probe_http_ssl ${result.targetHasSSL}
# HELP probe_http_status_code Response HTTP status code
# TYPE probe_http_status_code gauge
probe_http_status_code ${result.statusCode}
# TYPE probe_success gauge
probe_success ${result.success}
`;

const last = (array) => {
    var length = array == null ? 0 : array.length;
    return length ? array[length - 1] : undefined;
}

const testRedirect = (from, to, statusCode = 301, cb) => {
    const redirects = [];
    request({
        uri: from,
        time: true,
        strictSSL: true,
        timeout: 5000,
        followRedirect: (response) => redirects.push({ uri: response.headers.location, code: response.statusCode })
    }, (err, rsp, body) => {
        const length = err ? 0 : body.length;
        const isSuccessFull = () => {
            const lastRedirect = last(redirects);
            const hasTargetURL = normalizeUrl(lastRedirect.uri) === normalizeUrl(to);
            return hasTargetURL && parseInt(lastRedirect.code, 10) === parseInt(statusCode, 10) ? 1 : 0
        };

        const result = {
            lookup: err ? 0 : rsp.timings.lookup / 1000,
            duration: err ? 0 : rsp.timings.end / 1000,
            length,
            noOfRedirects: redirects.length,
            targetHasSSL: err ? 0 : rsp.request.uri.protocol === 'https:' ? 1 : 0,
            statusCode: err ? 0 : rsp.statusCode,
            success: err ? 0 : isSuccessFull()
        };


        cb(200, renderResult(result));
    });
};

const app = http.createServer((req, res) => {
    const requestUrl = url.parse(req.url);
    const { from, to, statusCode } = querystring.parse(requestUrl.query);
    switch (requestUrl.pathname) {
        // Health endpoint
        case '/':
            res.writeHead(200);
            res.end();
            break;

        case '/probe':
            testRedirect(from, to, statusCode, (code, body) => {
                res.writeHead(code, {
                    'Content-Type': 'text/plain'
                });
                res.end(body);
            });
            break;

        default:
            res.writeHead(404);
            res.end();
    }

});

app.listen(port, (err) => {
    if (err) {
        throw err;
    }
    console.log(`Listening at port ${port}`)
})
