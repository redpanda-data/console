import { useEffect, useState } from "react";
import { BuilderComponent, builder, useIsPreviewing } from "@builder.io/react";

// Put your API key here
builder.init("02fcf64912a7446abe6df3ff35304434");


export default function NotificationBar() {
  const isPreviewingInBuilder = useIsPreviewing();
  const [notFound, setNotFound] = useState(false);
  const [content, setContent] = useState(null);

  // get the page content from Builder
  useEffect(() => {
    async function fetchContent() {
      const content = await builder
        .get("notification-bar", {
          url: window.location.pathname
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
  
  // If no page is found, return 
  // a 404 page from your code.
  // The following hypothetical 
  // <FourOhFour> is placeholder.
  if (notFound && !isPreviewingInBuilder || !content) {
    return null
  }

  // return the page when found
  return (
    <>
      {/* Render the Builder page */}
      <BuilderComponent model="notification-bar" content={content} />
    </>
  );
}