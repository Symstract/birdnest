class ViolationTable {
  constructor() {
    this.tableElem = document.querySelector("table");
    this.errorElem = document.querySelector("#failed-to-load");
    this.noContentElem = document.querySelector("#no-content");
    this.spinnerElem = document.querySelector("#spinner");
    this.perviousDataDateAndTime = null;

    // The data is updated every 2 seconds on the server
    setInterval(() => this.updateTableContent(), 2000);
  }

  async updateTableContent() {
    const [violations, dateAndTime] = await this.getViolations();

    // Ensure responses that might arrive late, don't replace newer data
    if (dateAndTime && this.perviousDataDateAndTime) {
      if (dateAndTime.getTime() < this.perviousDataDateAndTime.getTime()) {
        return;
      }
    }

    if (dateAndTime) this.perviousDataDateAndTime = dateAndTime;

    this.spinnerElem.style.display = "none";

    if (violations === null) {
      this.tableElem.tBodies[0].innerHTML = "";
      this.tableElem.style.display = "none";
      this.errorElem.style.display = "block";
      this.noContentElem.style.display = "none";
      return;
    }

    if (!violations.length) {
      this.tableElem.tBodies[0].innerHTML = "";
      this.tableElem.style.display = "none";
      this.errorElem.style.display = "none";
      this.noContentElem.style.display = "block";
      return;
    }

    this.tableElem.tBodies[0].innerHTML = this.violationsToHTML(violations);
    this.tableElem.style.display = "block";
    this.errorElem.style.display = "none";
    this.noContentElem.style.display = "none";
  }

  async getViolations() {
    try {
      const response = await fetch("http://localhost:5000/api/ndz-violations");

      if (response.status !== 200) {
        return [null, null];
      }

      const data = await response.json();

      let updatedAt = null;

      if (data.lastUpdatedAt) updatedAt = new Date(data.lastUpdatedAt);

      return [data.violations, updatedAt];
    } catch (error) {
      console.log(error);
      return [null, null];
    }
  }

  violationsToHTML(violations) {
    return violations
      .map((violation) => {
        const distance = (violation.closestDistanceInMm / 1000).toFixed(2);
        const { firstName, lastName, phoneNumber, email } =
          violation.pilot || {};
        const na = "N/A";
        return `
          <tr>
            <td class="distance">${distance || na}</td>
            <td class="first-name">${firstName || na}</td>
            <td class="last-name">${lastName || na}</td>
            <td class="phone-number">${phoneNumber || na}</td>
            <td class="email">${email || na}</td>
          </tr>
        `;
      })
      .join("");
  }
}

const table = new ViolationTable();
