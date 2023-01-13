function addTableContent() {
  const table = document.querySelector("table");

  // Temporary test data
  const rowContent = `
    <tr>
      <td class="distance">87.54</td>
      <td class="first-name">Sami</td>
      <td class="last-name">Virtanen</td>
      <td class="phone-number">+358451734643</td>
      <td class="email">sami.virtanen@gmail.com</td>
    </tr>
  `;

  table.tBodies[0].innerHTML = rowContent.repeat(20);
}

addTableContent();
