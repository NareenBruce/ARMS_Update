import re
import time
import random
import logging

logger = logging.getLogger(__name__)

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import NoSuchElementException, ElementClickInterceptedException

from scraper.active_filter import extract_year, START_YEAR


def setup_driver(headless=False):
    """Creates a Chrome driver. headless=True for background, headless=False shows browser."""
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    driver = webdriver.Chrome(options=options)
    return driver


def wait_for_captcha(driver, timeout=120):
    """Waits for user to solve CAPTCHA if one is detected. Returns True if solved."""
    page_text = driver.find_element(By.TAG_NAME, "body").text.lower()
    has_captcha = 'captcha' in page_text or 'unusual traffic' in page_text

    if not has_captcha:
        return True

    logger.warning("=" * 60)
    logger.warning("CAPTCHA DETECTED! Please solve it in the browser window.")
    logger.warning(f"Waiting up to {timeout}s for you to complete it...")
    logger.warning("=" * 60)

    start = time.time()
    while time.time() - start < timeout:
        time.sleep(3)
        try:
            page_text = driver.find_element(By.TAG_NAME, "body").text.lower()
            if 'captcha' not in page_text and 'unusual traffic' not in page_text:
                logger.info("CAPTCHA solved! Continuing scrape...")
                return True
        except Exception:
            pass

    logger.warning("CAPTCHA timeout — could not proceed.")
    return False


def scrape_profile(driver, scholar_id, university=""):
    """
    Scrapes a Google Scholar profile using headless Chrome.
    Returns dict: {papers: [...], verified: bool, email: str}
    Returns None if profile not found (404).
    """
    url = f"https://scholar.google.com/citations?user={scholar_id}&hl=en&pagesize=100&view_op=list_works&sortby=pubdate"
    driver.get(url)
    time.sleep(random.uniform(2, 4))

    if "404 Not Found" in driver.title:
        return None

    # --- Check for CAPTCHA and wait for user to solve it ---
    wait_for_captcha(driver)

    # --- Institution verification: check for edu.my email ---
    verified = False
    email_found = ""
    try:
        # Method 1: Try the specific GS element by ID
        try:
            ivh = driver.find_element(By.ID, "gsc_prf_ivh")
            ivh_text = ivh.text.strip()
            if ivh_text and '.edu.my' in ivh_text.lower():
                domain_match = re.search(r'([\w.\-]+\.edu\.my)', ivh_text, re.IGNORECASE)
                if domain_match:
                    verified = True
                    email_found = domain_match.group(1)
        except NoSuchElementException:
            pass

        # Method 2: Try all gsc_prf_il elements (the info row class)
        if not verified:
            try:
                il_elements = driver.find_elements(By.CLASS_NAME, "gsc_prf_il")
                for el in il_elements:
                    el_text = el.text.strip()
                    if 'verified' in el_text.lower() and '.edu.my' in el_text.lower():
                        domain_match = re.search(r'([\w.\-]+\.edu\.my)', el_text, re.IGNORECASE)
                        if domain_match:
                            verified = True
                            email_found = domain_match.group(1)
                            break
            except Exception:
                pass

        # Method 3: Search visible page text (rendered, no HTML tags to worry about)
        if not verified:
            try:
                page_text = driver.find_element(By.TAG_NAME, "body").text
                if '.edu.my' in page_text.lower():
                    domain_match = re.search(r'([\w.\-]+\.edu\.my)', page_text, re.IGNORECASE)
                    if domain_match:
                        verified = True
                        email_found = domain_match.group(1)
            except Exception:
                pass
    except Exception:
        pass

    # --- Click "Show More" until year 2020 or earlier is found ---
    max_iterations = 50
    iteration = 0
    reached_2020 = False

    while iteration < max_iterations and not reached_2020:
        iteration += 1
        try:
            rows = driver.find_elements(By.CLASS_NAME, "gsc_a_tr")
            if not rows:
                break

            years_found = []
            for row in rows:
                try:
                    year_el = row.find_element(By.CLASS_NAME, "gsc_a_y")
                    year_text = year_el.text.strip()
                    if year_text and year_text.isdigit():
                        years_found.append(int(year_text))
                except:
                    continue

            if years_found and min(years_found) <= 2020:
                reached_2020 = True
                break

            btn = driver.find_element(By.ID, "gsc_bpf_more")
            if btn.get_attribute("disabled"):
                break
            driver.execute_script("arguments[0].click();", btn)
            time.sleep(random.uniform(1.5, 3.0))

        except (NoSuchElementException, ElementClickInterceptedException):
            break
        except:
            break

    # --- Scrape paper table ---
    papers = []
    rows = driver.find_elements(By.CLASS_NAME, "gsc_a_tr")

    for row in rows:
        try:
            title_el = row.find_element(By.CLASS_NAME, "gsc_a_at")
            title = title_el.text
            link = title_el.get_attribute("href")

            year_el = row.find_element(By.CLASS_NAME, "gsc_a_y")
            year = year_el.text.strip()

            papers.append({
                "title": title,
                "link": link,
                "year": year
            })
        except:
            continue

    return {
        "papers": papers,
        "verified": verified,
        "email": email_found
    }


def scrape_single_reviewer(name, g_scholar_id, university):
    """
    Scrapes a single reviewer profile. Returns result dict.
    """
    driver = setup_driver(headless=False)
    try:
        result = scrape_profile(driver, g_scholar_id, university)

        if result is None:
            return {"status": "failed", "name": name, "reason": "Profile not found (404)"}

        if not result['verified']:
            return {"status": "unverified", "name": name, "reason": "No edu.my email found"}

        # Filter active papers (2020+)
        active_papers = [p for p in result['papers'] if extract_year(p.get('year')) >= START_YEAR]

        if not active_papers:
            return {"status": "inactive", "name": name, "reason": "No active publications (post-2020)"}

        std_pubs = [{"title": p['title'], "link": p.get('link', ''), "year": p.get('year', '')} for p in active_papers]

        return {
            "status": "verified",
            "name": name,
            "g_scholar_id": g_scholar_id,
            "university": university,
            "verified": True,
            "email": result['email'],
            "publications": std_pubs
        }
    except Exception as e:
        logger.error(f"Error scraping {name}: {e}")
        return {"status": "failed", "name": name, "reason": str(e)}
    finally:
        driver.quit()


def scrape_batch_reviewers(entries, university):
    """
    Scrapes a list of reviewers. Returns dict with verified/unverified/inactive/failed lists.
    """
    driver = setup_driver(headless=False)

    verified_reviewers = []
    unverified_reviewers = []
    inactive_reviewers = []
    failed_reviewers = []

    try:
        for i, entry in enumerate(entries):
            name = entry['name']
            gid = entry['g_scholar_id']

            try:
                result = scrape_profile(driver, gid, university)

                if result is None:
                    failed_reviewers.append({"name": name, "g_scholar_id": gid, "reason": "404/Error"})
                    continue

                if not result['verified']:
                    unverified_reviewers.append({"name": name, "g_scholar_id": gid, "reason": "No edu.my email found"})
                else:
                    pass  # verified

                active_papers = [p for p in result['papers'] if extract_year(p.get('year')) >= START_YEAR]

                if not active_papers:
                    inactive_reviewers.append({"name": name, "g_scholar_id": gid, "reason": "No active publications"})
                    continue

                if result['verified']:
                    std_pubs = [{"title": p['title'], "link": p.get('link', ''), "year": p.get('year', '')} for p in active_papers]
                    verified_reviewers.append({
                        "name": name,
                        "g_scholar_id": gid,
                        "university": university,
                        "verified": True,
                        "email": result['email'],
                        "publications": std_pubs
                    })

            except Exception as e:
                failed_reviewers.append({"name": name, "g_scholar_id": gid, "reason": str(e)})
    finally:
        driver.quit()

    return {
        "verified": verified_reviewers,
        "unverified": unverified_reviewers,
        "inactive": inactive_reviewers,
        "failed": failed_reviewers
    }
