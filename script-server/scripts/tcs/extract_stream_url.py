from playwright.sync_api import sync_playwright

TARGET_URL = (
    "https://g01.tcsion.com/iCAMERAStreamingFW/ViewCameraFeedServlet"
    "?OrgID=2083&AssessmentCCTVID=316396485823226a2161o2083&CameraID=73982"
)

KEYWORDS = ["m3u8", "stream", "video", "ws", "live"]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    stream_links = set()

    def capture_request(request):
        url = request.url.lower()
        if any(k in url for k in KEYWORDS):
            stream_links.add(request.url)

    page.on("request", capture_request)

    page.goto(TARGET_URL, wait_until="networkidle")
    page.wait_for_timeout(5000)

    browser.close()

    if not stream_links:
        print("❌ No stream URLs captured.")
    else:
        print("✅ Possible stream URLs:")
        for link in stream_links:
            print(link)
