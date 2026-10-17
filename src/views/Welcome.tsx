type WelcomeProps = {
  onStart: () => void;
};

export function Welcome({ onStart }: WelcomeProps) {
  return (
    <main className="welcome">
      <p className="eyebrow">Porchlight</p>
      <h1>When someone sits with you, this screen learns who they are.</h1>
      <p className="lede">
        There is no profile to fill out. The camera watches the visitor. The microphone
        listens. A name and a few facts appear from what is actually said.
      </p>
      <ul className="plain">
        <li>Chrome turns speech into text. That audio goes to Chrome’s speech service.</li>
        <li>The transcript is sent to Claude, which pulls out a name, a relationship, and short facts.</li>
        <li>The memory is saved only on this computer. The audio is not kept.</li>
      </ul>
      <button className="primary" type="button" onClick={onStart}>
        Start
      </button>
    </main>
  );
}
