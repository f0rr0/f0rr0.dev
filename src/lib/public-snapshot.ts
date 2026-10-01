// A warm outage snapshot must not wait for the database's longer connection timeout.
export const readPublicSnapshot = async <T>(read: () => Promise<T>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      // oxlint-disable-next-line promise/avoid-new -- A cancellable timer must race the database read.
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("The public snapshot read timed out."));
        }, 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
