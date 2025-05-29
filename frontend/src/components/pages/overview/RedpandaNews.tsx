import React, { useEffect } from 'react';
import { observer } from 'mobx-react';
import { api } from 'state/backendApi';


export const RedpandaNews: React.FC = observer(() => {

  useEffect(() => {
    api.refreshRedpandaNews();
  }, []);

  return <ul>
    {api.redpandaNews?.newsItems?.map((item, index) => (
      <li key={index}>
        <a href={item.link}>{item.title}</a>
      </li>
    ))}
  </ul>
});