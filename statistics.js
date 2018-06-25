const fetch = require('node-fetch');
const table = require('text-table');

exports.handler = async (event, context, callback) => {
    console.log('Starting lambda');

    const showSenior = event.senior;

    let clanDataPromise = fetch('https://api.royaleapi.com/clan/' + event.clan_id, {
        headers: { auth: process.env.ROYALE_API_KEY },
    });

    let warlogPromise = fetch('https://api.royaleapi.com/clan/' + event.clan_id + '/warlog', {
        headers: { auth: process.env.ROYALE_API_KEY },
    });

    [clanDataPromise, warlogPromise] = await Promise.all([clanDataPromise, warlogPromise]);

    let clanData = clanDataPromise.json();
    let warlog = warlogPromise.json();

    [clanData, warlog] = await Promise.all([clanData, warlog]);

    console.log('warlog', warlog);
    console.log('clanData', clanData);
    console.log('Got data');

    const warData = warbattleStatistics(warlog);
    console.log(JSON.stringify(warData));
    const callbackResponse = [];
    console.log('Got clanStatistics');
    clanData.members.forEach(member => {
        const percent = (warData[member.tag] && warData[member.tag].percent) || -1;
        callbackResponse.push({
            name: member.name,
            tag: member.tag,
            percent: percent,
            donated: member.donations,
            received: member.donationsReceived,
            role: member.role,
            senior: member.donations >= 500 && member.donationsReceived >= 600 && percent >= 45,
        });
    });

    await writeDescription(event.discord_key, showSenior);

    const outputArray = [['Navn', 'CW %', 'Ut', 'Inn', 'Sen', showSenior ? 'Sen?' : '']].concat(
        callbackResponse
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
            .map(rate => [
                rate.name,
                rate.percent === -1 ? 'MIA' : rate.percent + '%',
                rate.donated,
                rate.received,
                rate.role === 'member'
                    ? '👶'
                    : rate.role === 'elder'
                        ? '👨'
                        : rate.role === 'coLeader' ? '👮' : rate.role === 'leader' ? '🤶' : '',
                showSenior
                    ? rate.role === 'coLeader' || rate.role === 'leader' ? '😇' : rate.senior ? '😀' : '❌'
                    : '',
            ])
    );

    console.log('outputArray', outputArray);

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

const writeDescription = (discord, showSenior) => {
    return fetch('https://discordapp.com/api/webhooks/' + discord, {
        method: 'POST',
        body: JSON.stringify({
            content:
                'CW % er vinstraten i klankrig, Ut er antall donerte, ' +
                'Inn er antall kort mottatt, Sen er nåværende rolle' +
                (showSenior
                    ? ', Sen? er om du er kvalifisert til å bli senior for denne uken (Minimum 500 donasjoner denne uken, ' +
                      '15 forespørsler denne uken og 45% vinstrate).'
                    : '.'),
        }),
        headers: { 'Content-Type': 'application/json' },
    });
};

const warbattleStatistics = warlog => {
    const data = {};
    warlog.forEach(war => {
        war.participants.forEach(participant => {
            if (!data[participant.tag]) {
                data[participant.tag] = {
                    played: 0,
                    won: 0,
                };
            }

            data[participant.tag].played += participant.battlesPlayed > 0 ? participant.battlesPlayed : 1;
            data[participant.tag].won += participant.wins;
        });
    });
    Object.keys(data).forEach(tag => {
        data[tag].percent = (100 * data[tag].won / data[tag].played).toFixed();
    });
    return data;
};
