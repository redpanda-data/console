import { useEffect, useState } from "react";
import { BuilderComponent, builder, useIsPreviewing } from "@builder.io/react";
import { api } from "state/backendApi";

// Put your API key here
builder.init("02fcf64912a7446abe6df3ff35304434");

// set whether you're using the Visual Editor,
// whether there are changes,
// and render the content if found
export default function NurturePanel() {
const platform = api.isRedpanda ? 'redpanda' : 'kafka';

  const isPreviewingInBuilder = useIsPreviewing();
  const [notFound, setNotFound] = useState(false);
  const [content, setContent] = useState<any>(null);

  // get the page content from Builder
  useEffect(() => {
    async function fetchContent() {
      const content = await builder
        .get("nurture-panel", {
          url: window.location.pathname,
          userAttributes: {
            platform,
          },
        })
        .promise();

      setContent(content);
      setNotFound(!content);

      // if the page title is found, 
      // set the document title
      if (content?.data.title) {
      document.title = content.data.title
      }
    }
    fetchContent();
  }, [window.location.pathname]);
  
  console.log({
    notFound,
    isPreviewingInBuilder,
    content,
  });
  
  // If no page is found, return 
  // a 404 page from your code.
  // The following hypothetical 
  // <FourOhFour> is placeholder.
  if (notFound && !isPreviewingInBuilder) {
    return <div>Not found {JSON.stringify({
        notFound,
        isPreviewingInBuilder,
        content,
    })}</div>; // TODO
  }

  // return the page when found
  return (
    <>
      {/* Render the Builder page */}
      <BuilderComponent model="nurture-panel" content={content} />
    </>
  );
}