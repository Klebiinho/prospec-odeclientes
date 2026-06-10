"""
Google Maps Scraper using Playwright
Extracts business leads: name, address, phone, website, rating, category
"""

import asyncio
import random
import re
import logging
from typing import Optional
from playwright.async_api import async_playwright, Page, Browser

logger = logging.getLogger(__name__)


class GoogleMapsScraper:
    """Scraper for Google Maps business listings using Playwright."""

    def __init__(self):
        self.browser: Optional[Browser] = None
        self.base_url = "https://www.google.com/maps"

    async def start_browser(self):
        """Launch headless Chromium browser."""
        pw = await async_playwright().start()
        self.browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        logger.info("Browser started successfully")

    async def close_browser(self):
        """Close browser instance."""
        if self.browser:
            await self.browser.close()
            logger.info("Browser closed")

    async def _create_page(self) -> Page:
        """Create a new browser page with stealth settings."""
        if not self.browser:
            raise RuntimeError("Browser is not initialized")
        context = await self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
        )

        # Anti-detection: override navigator.webdriver
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
        """)

        page = await context.new_page()
        return page

    async def _random_delay(self, min_s: float = 1.0, max_s: float = 3.0):
        """Random delay to mimic human behavior."""
        delay = random.uniform(min_s, max_s)
        await asyncio.sleep(delay)

    async def _scroll_results(self, page: Page, max_scrolls: int = 5):
        """Scroll the results panel to load more businesses."""
        scrollable_selector = 'div[role="feed"]'

        try:
            await page.wait_for_selector(scrollable_selector, timeout=10000)
        except Exception:
            logger.warning("Could not find scrollable results feed")
            return

        for i in range(max_scrolls):
            try:
                await page.evaluate(
                    """(selector) => {
                        const el = document.querySelector(selector);
                        if (el) el.scrollTop = el.scrollHeight;
                    }""",
                    scrollable_selector,
                )
                await self._random_delay(1.5, 3.0)
                logger.info(f"Scroll {i + 1}/{max_scrolls} completed")

                # Check if "end of list" message appeared
                end_of_list = await page.query_selector(
                    "p.fontBodyMedium span:has-text('final da lista')"
                )
                if not end_of_list:
                    end_of_list = await page.query_selector(
                        "p.fontBodyMedium span:has-text('end of list')"
                    )
                if end_of_list:
                    logger.info("Reached end of results list")
                    break
            except Exception as e:
                logger.warning(f"Scroll error: {e}")
                break

    def _clean_phone(self, phone: str) -> str:
        """Clean and normalize phone number."""
        if not phone:
            return ""
        # Remove all non-digit characters except + and spaces
        cleaned = re.sub(r'[^\d+\s()-]', '', phone).strip()
        return cleaned

    async def _extract_lead_details(self, page: Page, element) -> Optional[dict]:
        """Extract details from a single business listing element."""
        try:
            lead = {}

            # Try to get the business name from aria-label of the link
            name_el = await element.query_selector("a[aria-label]")
            if name_el:
                lead["name"] = await name_el.get_attribute("aria-label")
                lead["google_maps_url"] = await name_el.get_attribute("href") or ""
            else:
                # Fallback: get text from the heading
                heading = await element.query_selector(".fontHeadlineSmall")
                if heading:
                    lead["name"] = (await heading.inner_text()).strip()
                else:
                    return None

            if not lead.get("name"):
                return None

            # Get all text content for parsing
            text_content = await element.inner_text()
            lines = [line.strip() for line in text_content.split("\n") if line.strip()]

            # Extract rating
            rating_el = await element.query_selector("span.fontBodyMedium > span[aria-label]")
            if rating_el:
                aria = await rating_el.get_attribute("aria-label")
                if aria:
                    rating_match = re.search(r'([\d,\.]+)', aria)
                    if rating_match:
                        try:
                            lead["rating"] = float(rating_match.group(1).replace(",", "."))
                        except ValueError:
                            lead["rating"] = None

            # Extract reviews count
            reviews_match = re.search(r'\((\d[\d.]*)\)', text_content)
            if reviews_match:
                try:
                    lead["reviews_count"] = int(
                        reviews_match.group(1).replace(".", "").replace(",", "")
                    )
                except ValueError:
                    lead["reviews_count"] = None

            # Extract address and phone from the text lines
            lead["address"] = ""
            lead["phone"] = ""
            lead["category"] = ""
            lead["website"] = ""

            for line in lines:
                # Phone patterns (Brazilian and international)
                phone_match = re.search(
                    r'(\+?\d{1,3}[\s-]?)?\(?\d{2,3}\)?[\s-]?\d{4,5}[\s-]?\d{4}',
                    line
                )
                if phone_match:
                    lead["phone"] = self._clean_phone(phone_match.group(0))
                    continue

                # Skip the name and rating lines
                if lead["name"] and line == lead["name"]:
                    continue
                if re.match(r'^[\d,\.]+$', line):
                    continue
                if re.match(r'^\(\d+\)$', line):
                    continue

                # Category detection (usually contains · separator)
                if "·" in line and not lead["category"]:
                    parts = line.split("·")
                    lead["category"] = parts[0].strip()
                    if len(parts) > 1:
                        potential_addr = parts[-1].strip()
                        if potential_addr and not lead["address"]:
                            lead["address"] = potential_addr
                    continue

                # Address: lines with typical address patterns
                addr_patterns = [
                    r'R\.\s', r'Rua\s', r'Av\.\s', r'Avenida\s',
                    r'Pç\.\s', r'Praça\s', r'Al\.\s', r'Alameda\s',
                    r'Rod\.\s', r'Rodovia\s', r'Estr\.\s', r'Estrada\s',
                    r'\d{5}-\d{3}',  # CEP
                    r'Nº\s?\d+', r'n[°º]\s?\d+',
                ]
                if any(re.search(p, line, re.IGNORECASE) for p in addr_patterns):
                    if not lead["address"]:
                        lead["address"] = line
                    continue

                # Website patterns
                if re.match(r'^[\w-]+\.\w{2,}', line) and "." in line and " " not in line:
                    lead["website"] = line
                    continue

                # If no category yet and line is short, might be category
                if not lead["category"] and len(line) < 40 and not re.search(r'\d{3}', line):
                    lead["category"] = line

            # If still no address, try to get from a broader approach
            if not lead["address"]:
                for line in lines:
                    if (
                        len(line) > 10
                        and line != lead["name"]
                        and line != lead.get("category", "")
                        and not re.match(r'^[\d,\.\(\)]+$', line)
                        and "estrela" not in line.lower()
                        and "avalia" not in line.lower()
                    ):
                        lead["address"] = line
                        break

            return lead

        except Exception as e:
            logger.error(f"Error extracting lead details: {e}")
            return None

    async def search(
        self,
        query: str,
        max_results: int = 50,
        max_scrolls: int = 8,
        on_progress=None,
    ) -> list[dict]:
        """
        Search Google Maps for businesses and extract lead data.

        Args:
            query: Search term (e.g., "Restaurantes em São Paulo")
            max_results: Maximum number of leads to collect
            max_scrolls: Maximum scroll iterations
            on_progress: Optional callback for progress updates

        Returns:
            List of lead dictionaries
        """
        if not self.browser:
            await self.start_browser()

        page = await self._create_page()
        leads = []

        try:
            # Navigate to Google Maps
            logger.info(f"Navigating to Google Maps with query: {query}")
            search_url = f"{self.base_url}/search/{query}"
            await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
            await self._random_delay(3.0, 5.0)

            # Accept cookies if dialog appears
            try:
                accept_btn = await page.query_selector(
                    'button[aria-label*="Aceitar"], button[aria-label*="Accept"]'
                )
                if accept_btn:
                    await accept_btn.click()
                    await self._random_delay(1.0, 2.0)
            except Exception:
                pass

            # Wait for results to load
            try:
                await page.wait_for_selector('div[role="feed"]', timeout=15000)
            except Exception:
                logger.warning("No results feed found. Trying alternative selector...")
                try:
                    await page.wait_for_selector(".Nv2PK", timeout=10000)
                except Exception:
                    logger.error("No results found for this query")
                    return []

            # Scroll to load more results
            logger.info("Scrolling to load more results...")
            await self._scroll_results(page, max_scrolls=max_scrolls)

            # Get all listing elements
            listing_elements = await page.query_selector_all('div[role="feed"] > div > div > a')

            if not listing_elements:
                # Fallback selector
                listing_elements = await page.query_selector_all(".Nv2PK")

            logger.info(f"Found {len(listing_elements)} listing elements")

            # Extract data from each listing
            for i, element in enumerate(listing_elements):
                if len(leads) >= max_results:
                    break

                # Click on the listing to get more details
                try:
                    parent = await element.query_selector("xpath=..")
                    if parent:
                        element = parent

                    lead = await self._extract_lead_details(page, element)

                    if lead and lead.get("name"):
                        # Avoid duplicates
                        existing_names = {l["name"] for l in leads}
                        if lead["name"] not in existing_names:
                            leads.append(lead)
                            logger.info(
                                f"Lead {len(leads)}: {lead['name']} | "
                                f"Phone: {lead.get('phone', 'N/A')} | "
                                f"Address: {lead.get('address', 'N/A')}"
                            )

                            if on_progress:
                                await on_progress(len(leads), lead)

                except Exception as e:
                    logger.error(f"Error processing listing {i}: {e}")
                    continue

                await self._random_delay(0.3, 0.8)

            logger.info(f"Scraping completed. Total leads: {len(leads)}")

        except Exception as e:
            logger.error(f"Scraping error: {e}")
            raise

        finally:
            await page.close()

        return leads


async def scrape_google_maps(
    query: str,
    max_results: int = 50,
    max_scrolls: int = 8,
) -> list[dict]:
    """
    Convenience function to scrape Google Maps.

    Args:
        query: Search query (e.g., "Padarias em Curitiba")
        max_results: Max leads to collect
        max_scrolls: Max scroll iterations

    Returns:
        List of lead dicts with keys: name, address, phone, website,
        rating, reviews_count, category, google_maps_url
    """
    scraper = GoogleMapsScraper()
    try:
        await scraper.start_browser()
        results = await scraper.search(
            query=query,
            max_results=max_results,
            max_scrolls=max_scrolls,
        )
        return results
    finally:
        await scraper.close_browser()
