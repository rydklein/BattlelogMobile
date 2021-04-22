// Hi everyone! This is horrible code. Why? I have no
// idea what I'm doing, and will probably rewrite this once
// I figure out how to do everything properly.
const axios = require("axios").default;
const qs = require("qs");
const uuid = require("uuid");
const config = require("./config.json");
// const authUrl = "https://www.ea.com/login";
const authUrl = "https://accounts.ea.com/connect/auth?client_id=sparta-companion-web&response_type=code&display=web2/login&locale=en_US&redirect_uri=https%3A%2F%2Fcompanion.battlefield.com%2Fcompanion%2Fsso%3Fprotocol%3Dhttps";
const compAPI = "https://companion-api.battlefield.com/jsonrpc/web/api?Companion.";
// Not sure how much of this is actually needed. I don't really feel like testing, though.
const eaAuthPayload = {
    "email": config.email,
    "password": config.password,
    "pn_text": "",
    "passwordForPhone": "",
    "country": "US",
    "phoneNumber": "",
    "_rememberMe": "on",
    "rememberMe": "on",
    "_eventId": "submit",
    "gCaptchaResponse": "",
    "thirdPartyCaptchaResponse": "",
    "isPhoneNumberLogin": "false",
    "isIncompletePhone": "",
    "countryPrefixPhoneNumber": "",
};
async function getEALoginCode() {
    // Get our session cookies and login url
    const success = await getWithCookieRedirects(authUrl, null);
    // Again, not sure how many of these are needed. I was just copy-pasting desperately.
    // Always good to make your scraper look like a browser though.
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Content-Type": "application/x-www-form-urlencoded",
        Connection: "keep-alive",
        Cookie: success.cookies,
        Referrer: success.url,
        "Upgrade-Insecure-Requests": "1",
    };
    // Set up our options. I could have done axios.post(url, options), but this way was cleaner.
    // Data is urlencoded with qs.
    const options = {
        method: "POST",
        headers: headers,
        data: qs.stringify(eaAuthPayload),
        maxRedirects: 0,
        url: success.url,
    };
    let login;
    try {
        // This really should fail. If it doesn't, something broke.
        // Fails when we get a redirect (this is expected).
        // Why not just go through with the redirects? We need to save
        // cookies between each one. I hate my life.
        login = await axios(options);
    }
    catch (error) {
        // I do this differently than I did below because I finally drank coffee
        // And realized how much easier it was to just do it below.
        login = error;
    }
    // This code goes through the cookies returned from the login POST, and
    // Appends them to the session data from the first GET requests.
    let i = 1;
    let cookieOption = success.cookies + "; ";
    // Go through the set-cookie header element, which is unhelpfully parsed
    // as an array, and return it to the natural cookie1=value1; cookie2=value2
    // format.
    for (let cookie of login.response.headers["set-cookie"]) {
        cookie = cookie.split("; ")[0];
        if (i < login.response.headers["set-cookie"].length) {
            cookie += "; ";
        }
        cookieOption += cookie;
        i++;
    }
    // In the login flow, the POST request redirects to another page. The only content in that page is like 3 lines
    // of JS that redirect to that same page plus "&_eventId=dynamicChallenge". Why. Why? EA? Dice? Do you need help?
    const redirUrl = `https://${login.request.host}${login.response.headers.location}&_eventId=dynamicChallenge`;
    const loginData = await getWithCookieRedirects(redirUrl, cookieOption);
    return loginData;
}
// gore
async function getWithCookieRedirects(url, cookies) {
    let loginData;
    // Again with the potentially useless headers.
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        Cookie: cookies,
        "Upgrade-Insecure-Requests": "1",
    };
    try {
        // Same thing as getEALoginCode: we know it will fail.
        loginData = await axios.get(url, { maxRedirects: 0, headers: headers });
    }
    catch (error) {
        // Again, same thing as getEALoginCode.
        let cookieOption = "";
        let i = 1;
        if (error.response.headers["set-cookie"]) {
            for (let cookie of error.response.headers["set-cookie"]) {
                cookie = cookie.split(";")[0];
                if (i < error.response.headers["set-cookie"].length) {
                    cookie += "; ";
                }
                cookieOption += cookie;
                i++;
            }
        }
        else {
            cookieOption = null;
        }
        // I really should do this in a less disgusting way. However,
        // I really don't care.
        let redirUrl = error.response.headers.location;
        if (redirUrl.includes("&code=")) {
            const returnData = redirUrl.split("code=")[1];
            return returnData;
        }
        // If the redirect location is just the location without the domain,
        // attach the domain to the front.
        if (error.response.headers.location.startsWith("/")) {
            redirUrl = `https://${error.request.host}${error.response.headers.location}`;
        }
        // Just do this until we are no longer getting redirects (or we get the code).
        // It's that easy!
        loginData = await getWithCookieRedirects(redirUrl, cookieOption);
        return loginData;
    }
    const returnData = {
        url: url,
        cookies: cookies,
    };
    return returnData;
}
async function getCompanionSession() {
    const bcAuthPayload = {
        "jsonrpc": "2.0",
        "method": "Companion.loginFromAuthCode",
        "params":
            {
                "code": await getEALoginCode(),
                "redirectUri":"https://companion.battlefield.com/companion/sso?protocol=https",
            },
        "id": uuid.v4(),
    };
    return (await axios.post(compAPI + "loginFromAuthCode", bcAuthPayload)).data.result.id;
}
async function getBattlelogToken() {
    const blTokenPayload = {
        "jsonrpc":"2.0",
        "method":"Companion.getBattlelogAuthCode",
        "params":{},
        "id":uuid.v4(),
    };
    const headers = {
        "X-GatewaySession": await getCompanionSession(),
        "X-ClientVersion": "companion-4569f32f",
    };
    const options = {
        method: "POST",
        headers: headers,
        data: blTokenPayload,
        url: compAPI + "getBattlelogAuthCode",
    };
    const battlelogToken = await axios(options);
    console.log(battlelogToken);
}