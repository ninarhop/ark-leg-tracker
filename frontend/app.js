const container = document.getElementById("legislators");

container.innerHTML = "";

legislators.forEach((legislator) => {
  const votesHtml = legislator.latestVotes
    .map(vote => `<li>${vote.bill}: ${vote.vote}</li>`)
    .join("");

  container.innerHTML += `
    <div class="card">

      <h2>${legislator.name}</h2>

      <p><strong>Chamber:</strong> ${legislator.chamber}</p>

      <p><strong>District:</strong> ${legislator.district}</p>

      <p><strong>Party:</strong> ${legislator.party}</p>

      <h3>Recent Votes</h3>

      <ul>
        ${votesHtml}
      </ul>

    </div>
  `;
});
