const fetch = require('node-fetch');
const table = require('text-table');

exports.handler = async (event, context, callback) => {
    console.log('Starting lambda');
    const response = await fetch('https://api.royaleapi.com/clan/' + event.clan_id, {
        headers: { auth: process.env.ROYALE_API_KEY },
    });
    const responseJson = await response.json();
    const members = responseJson.members.map(member => member.tag);

    const promise = await fetch('https://api.royaleapi.com/clan/' + event.clan_id + '/warlog', {
        headers: { auth: process.env.ROYALE_API_KEY },
    });
    const statistics = await promise.json();

    console.log('Got data');
    const data = {};

    statistics.forEach(war => {
        war.participants.forEach(participant => {
            if (members.indexOf(participant.tag) !== -1) {
                if (!data[participant.tag]) {
                    data[participant.tag] = {
                        played: 0,
                        won: 0,
                        name: participant.name,
                        donated: responseJson.members[members.indexOf(participant.tag)].donations,
                        received: responseJson.members[members.indexOf(participant.tag)].donationsReceived,
                        role: responseJson.members[members.indexOf(participant.tag)].role,
                    };
                }

                data[participant.tag].played += participant.battlesPlayed > 0 ? participant.battlesPlayed : 1;
                data[participant.tag].won += participant.wins;
            }
        });
    });
    console.log('Transformed data');
    let callbackResponse = [];
    Object.keys(data).forEach(tag => {
        callbackResponse.push({
            name: data[tag].name,
            tag: tag,
            percent: (100 * data[tag].won / data[tag].played).toFixed(),
            donated: data[tag].donated,
            received: data[tag].received,
            role: data[tag].role,
            senior:
                data[tag].donated >= 500 &&
                data[tag].received >= 600 &&
                (100 * data[tag].won / data[tag].played).toFixed() >= 45,
        });
    });

    const webhook1 = fetch('https://discordapp.com/api/webhooks/' + event.discord_key, {
        method: 'POST',
        body: JSON.stringify({
            content:
                'Inkluderer for øyeblikket ikke dem som ikke spiller krig. \n' +
                'CW % er vinstraten i klankrig, Ut er antall donerte, ' +
                'Inn er antall kort mottatt, Nå er nåværende rolle, Sen? er om du er kvalifisert til å bli senior for denne uken.',
        }),
        headers: { 'Content-Type': 'application/json' },
    });
    await Promise.all([webhook1]);

    const outputArray = [['Navn', 'CW %', 'Ut', 'Inn', 'Nå', 'Sen?']].concat(
        callbackResponse
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
            .map(rate => [
                rate.name,
                rate.percent + '%',
                rate.donated,
                rate.received,
                rate.role === 'member'
                    ? '👶'
                    : rate.role === 'elder'
                        ? '👨'
                        : rate.role === 'coLeader' ? '👮' : rate.role === 'leader' ? '🤶' : '',
                rate.role === 'coLeader' || rate.role === 'leader' ? '😇' : rate.senior ? '😀' : '❌',
            ])
    );

    const tableText = table(outputArray);

    for (let i = 0; i < tableText.split('\n').length; i += 20) {
        var responseText =
            '```' +
            tableText
                .split('\n')
                .slice(i, i + 20)
                .join('\n') +
            '```';
        console.log('Generated response:', responseText);
        const webhook = fetch('https://discordapp.com/api/webhooks/' + event.discord_key, {
            method: 'POST',
            body: JSON.stringify({ content: responseText }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then(response => console.log('Request ok:', response.statusText))
            .catch(err => console.log('Request failed:', err));
        await Promise.all([webhook]);
    }
};
